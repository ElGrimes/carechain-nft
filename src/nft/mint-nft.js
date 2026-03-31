// ============================================================
// CareChain NFT - NFT Minting Script
// Purpose: Mint tiered membership NFTs (Diamond, Gold, Silver)
// from the authorized minter wallet on behalf of the treasury
// ============================================================

// dotenv loads our .env file so we can access wallet seeds
// without hardcoding them in our code
require("dotenv").config()
const xrpl = require("../../node_modules/xrpl")

// ---- TIER CONFIGURATIONS --------------------------------
// This object defines the settings for each membership tier
// We store them here so we can easily reference them when minting
// NFTokenTaxon is a grouping number — we use it to separate tiers
// 0 = Diamond, 1 = Gold, 2 = Silver
const TIERS = {
  diamond: {
    name: "Diamond",
    taxon: 0,
    transferFee: 0,    // 0% royalty — soulbound so no transfers
    description: "CareChain NFT Diamond Tier - Priority concierge healthcare access"
  },
  gold: {
    name: "Gold",
    taxon: 1,
    transferFee: 0,    // 0% royalty — soulbound so no transfers
    description: "CareChain NFT Gold Tier - Enhanced healthcare access and benefits"
  },
  silver: {
    name: "Silver",
    taxon: 2,
    transferFee: 0,    // 0% royalty — soulbound so no transfers
    description: "CareChain NFT Silver Tier - Essential healthcare membership benefits"
  }
}

// ---- NFT FLAGS EXPLANATION ------------------------------
// XRPL NFT flags are numbers that control NFT behavior.
// They are set at mint and CANNOT be changed afterward.
// We use flag value 1 which means:
// tfBurnable = true  (issuer can burn the NFT for renewals)
// tfTransferable = false (soulbound — cannot be transferred)
// This is exactly what CareChain needs:
// - Burnable so we can handle monthly renewal cycle
// - Non-transferable so membership stays with the patient
const NFT_FLAGS = 1  // tfBurnable only — non-transferable

async function mintNFT(tier, patientWalletAddress) {

  // ---- STEP 1: VALIDATE TIER INPUT ----------------------
  // Make sure the tier passed in is valid before doing anything
  // toLowerCase() handles if someone passes "DIAMOND" or "Diamond"
  const tierConfig = TIERS[tier.toLowerCase()]
  if (!tierConfig) {
    console.error("❌ Invalid tier. Must be: diamond, gold, or silver")
    return
  }

  console.log(`\n⏳ Minting ${tierConfig.name} tier NFT...`)
  console.log(`   Patient Wallet: ${patientWalletAddress}`)

  // ---- STEP 2: CONNECT TO TESTNET -----------------------
  const client = new xrpl.Client("wss://s.altnet.rippletest.net:51233")
  await client.connect()
  console.log("✅ Connected to XRPL Testnet")

  // ---- STEP 3: LOAD WALLETS FROM .env -------------------
  // We load BOTH wallets because:
  // - Minter wallet signs and submits the transaction
  // - Treasury wallet address is set as the Issuer field
  // This is what makes authorized minting work
  const treasuryWallet = xrpl.Wallet.fromSeed(
    process.env.TREASURY_WALLET_SEED
  )
  const minterWallet = xrpl.Wallet.fromSeed(
    process.env.MINTER_WALLET_SEED
  )

  console.log("✅ Wallets loaded")
  console.log("   Treasury (Issuer):", treasuryWallet.address)
  console.log("   Minter:", minterWallet.address)

  // ---- STEP 4: BUILD NFT METADATA URI -------------------
  // The URI field points to a JSON file that describes the NFT
  // This JSON file contains the tier name, description, image etc.
  // For now we're using a placeholder URI
  // Later this will point to your actual metadata on IPFS
  // 
  // convertStringToHex() converts the URI to hex format
  // because the XRPL stores the URI as hexadecimal
  const metadata = {
    tier: tierConfig.name,
    description: tierConfig.description,
    platform: "CareChain NFT",
    version: "1.0"
  }

  // For testnet we encode the metadata as a string URI
  // On mainnet this will be an IPFS hash pointing to 
  // a JSON file stored on decentralized storage
  const uri = xrpl.convertStringToHex(
    `https://carechainnft.com/metadata/${tier.toLowerCase()}`
  )

  // ---- STEP 5: BUILD THE MINT TRANSACTION ---------------
  // This is the core NFTokenMint transaction
  // Every field here has a specific purpose:
  //
  // TransactionType: tells the ledger what we're doing
  // Account: the minter wallet — who is submitting this tx
  // Issuer: the treasury wallet — who officially issued the NFT
  //         This field is what makes authorized minting work
  // URI: pointer to the NFT metadata
  // Flags: controls transferability and burnability
  // NFTokenTaxon: groups NFTs by tier (0=Diamond, 1=Gold, 2=Silver)
  // TransferFee: royalty percentage (0 since NFTs are soulbound)
  const mintTx = await client.autofill({
    TransactionType: "NFTokenMint",
    Account: minterWallet.address,
    Issuer: treasuryWallet.address,
    URI: uri,
    Flags: NFT_FLAGS,
    NFTokenTaxon: tierConfig.taxon,
    TransferFee: tierConfig.transferFee
  })

  console.log("\n⏳ Submitting mint transaction to XRPL...")

  // ---- STEP 6: SIGN AND SUBMIT -------------------------
  // The MINTER wallet signs this transaction — not the treasury
  // This is the whole point of authorized minting:
  // the treasury never needs to be online or exposed
  const signedMintTx = minterWallet.sign(mintTx)
  const mintResult = await client.submitAndWait(signedMintTx.tx_blob)

  console.log("✅ Mint result:", 
    mintResult.result.meta.TransactionResult)

  // ---- STEP 7: GET THE NEW NFT ID ----------------------
  // After minting we need to find the NFTokenID
  // that was just created — it's stored in the transaction
  // metadata under AffectedNodes
  // We look for a node where an NFTokenPage was created
  // or modified — that's where our new NFT lives
  const nftokenID = mintResult.result.meta.AffectedNodes
    .find(node => 
      node.CreatedNode?.LedgerEntryType === "NFTokenPage" ||
      node.ModifiedNode?.LedgerEntryType === "NFTokenPage"
    )

  // ---- STEP 8: TRANSFER TO PATIENT WALLET --------------
  // Now we send the NFT to the patient's wallet
  // We create a sell offer for 0 XRP (free transfer)
  // with the patient's address as the specific destination
  // This means ONLY the patient can accept this offer
  console.log("\n⏳ Creating transfer offer for patient wallet...")

  // First get the NFTs to find our new NFTokenID
  const nfts = await client.request({
    command: "account_nfts",
    account: minterWallet.address
  })

  // Find the most recently minted NFT matching our tier taxon
  const newNFT = nfts.result.account_nfts
    .filter(nft => nft.NFTokenTaxon === tierConfig.taxon)
    .pop()  // .pop() gets the last item — most recently minted

  if (!newNFT) {
    console.error("❌ Could not find newly minted NFT")
    await client.disconnect()
    return
  }

  console.log("✅ NFT found:", newNFT.NFTokenID)

  // Create a sell offer for 0 XRP to transfer to patient
  // Amount "0" = free transfer
  // Destination = only this specific wallet can accept
  const offerTx = await client.autofill({
    TransactionType: "NFTokenCreateOffer",
    Account: minterWallet.address,
    NFTokenID: newNFT.NFTokenID,
    Amount: "0",
    Destination: patientWalletAddress,
    Flags: xrpl.NFTokenCreateOfferFlags.tfSellNFToken
  })

  const signedOfferTx = minterWallet.sign(offerTx)
  const offerResult = await client.submitAndWait(signedOfferTx.tx_blob)

  console.log("✅ Transfer offer result:",
    offerResult.result.meta.TransactionResult)

  // Get the offer ID from the transaction results
  const offerNode = offerResult.result.meta.AffectedNodes
    .find(node => node.CreatedNode?.LedgerEntryType === "NFTokenOffer")
  
  const offerID = offerNode?.CreatedNode?.NewFields?.index ||
    offerNode?.CreatedNode?.LedgerIndex

  // ---- STEP 9: DISPLAY SUMMARY -------------------------
  console.log("\n==========================================")
  console.log("         CARECHAINNFT MINT SUMMARY       ")
  console.log("==========================================")
  console.log("Tier:", tierConfig.name)
  console.log("NFTokenID:", newNFT.NFTokenID)
  console.log("Issuer (Treasury):", treasuryWallet.address)
  console.log("Minted By:", minterWallet.address)
  console.log("Patient Wallet:", patientWalletAddress)
  console.log("Transfer Offer ID:", offerID)
  console.log("------------------------------------------")
  console.log("STATUS: ✅ NFT MINTED AND OFFER CREATED")
  console.log("Patient must accept the offer in Xaman")
  console.log("to receive their membership NFT")
  console.log("==========================================\n")

  // ---- STEP 10: DISCONNECT -----------------------------
  await client.disconnect()
  console.log("✅ Disconnected from XRPL Testnet")

  // Return the key data for use in other scripts later
  return {
    nftokenID: newNFT.NFTokenID,
    offerID: offerID,
    tier: tierConfig.name,
    patientWallet: patientWalletAddress
  }
}

// ---- TEST: MINT A DIAMOND TIER NFT -------------------
// For testing we're minting to the treasury wallet address
// In production this will be the patient's Xaman wallet address
// Replace the address below with any testnet wallet address
const testPatientWallet = process.env.TREASURY_WALLET_ADDRESS

mintNFT("diamond", testPatientWallet)