// ============================================================
// CareChain NFT - Reissue Script
// Purpose: Mint a fresh NFT after a patient renews their
// membership payment. This is the second half of the
// monthly renewal cycle:
// Step 1 - burn-nft.js burns the expired NFT
// Step 2 - reissue-nft.js mints a fresh one
//
// KEY CONCEPT: Reissue is just a fresh mint delivered to
// the patient's wallet. The patient gets a brand new NFT
// with a new 30 day cycle. Their tier stays the same.
// ============================================================

require("dotenv").config()
const xrpl = require("../../node_modules/xrpl")

// ---- TIER CONFIGURATIONS --------------------------------
// Same tier config as mint-nft.js
// We define it here too so this script is self contained
const TIERS = {
  diamond: {
    name: "Diamond",
    taxon: 0,
    transferFee: 0,
    description: "CareChain NFT Diamond Tier - Priority concierge healthcare access"
  },
  gold: {
    name: "Gold",
    taxon: 1,
    transferFee: 0,
    description: "CareChain NFT Gold Tier - Enhanced healthcare access and benefits"
  },
  silver: {
    name: "Silver",
    taxon: 2,
    transferFee: 0,
    description: "CareChain NFT Silver Tier - Essential healthcare membership benefits"
  }
}

// tfBurnable only — non-transferable soulbound NFT
const NFT_FLAGS = 1

async function reissueNFT(tier, patientWalletAddress) {

  // ---- STEP 1: VALIDATE INPUT ---------------------------
  // Confirm tier and patient wallet are provided
  // before connecting to the ledger
  const tierConfig = TIERS[tier.toLowerCase()]
  if (!tierConfig) {
    console.error("❌ Invalid tier. Must be: diamond, gold, or silver")
    return
  }
  if (!patientWalletAddress) {
    console.error("❌ Patient wallet address is required")
    return
  }

  console.log("\n⏳ Initiating NFT reissue...")
  console.log("   Tier:", tierConfig.name)
  console.log("   Patient Wallet:", patientWalletAddress)

  // ---- STEP 2: CONNECT TO TESTNET -----------------------
  const client = new xrpl.Client("wss://s.altnet.rippletest.net:51233")
  await client.connect()
  console.log("✅ Connected to XRPL Testnet")

  // ---- STEP 3: LOAD WALLETS ----------------------------
  // We need both wallets:
  // Treasury = the issuer whose name appears on the NFT
  // Minter = the one that actually submits the transaction
  const treasuryWallet = xrpl.Wallet.fromSeed(
    process.env.TREASURY_WALLET_SEED
  )
  const minterWallet = xrpl.Wallet.fromSeed(
    process.env.MINTER_WALLET_SEED
  )

  console.log("✅ Wallets loaded")
  console.log("   Treasury (Issuer):", treasuryWallet.address)
  console.log("   Minter:", minterWallet.address)

  // ---- STEP 4: CONFIRM OLD NFT IS BURNED ---------------
  // Before reissuing we confirm the patient does NOT
  // currently hold an active NFT of this tier.
  // This prevents duplicate active memberships.
  // If they still have an active NFT we stop here.
  console.log("\n⏳ Confirming previous NFT is burned...")

  const patientNFTs = await client.request({
    command: "account_nfts",
    account: patientWalletAddress
  })

  // Check if patient already has an active NFT of this tier
  // NFTokenTaxon matches the tier taxon number
  const existingNFT = patientNFTs.result.account_nfts
    .find(nft => nft.NFTokenTaxon === tierConfig.taxon)

  if (existingNFT) {
    console.error("❌ Patient already holds an active NFT for this tier")
    console.error("   NFTokenID:", existingNFT.NFTokenID)
    console.error("   Burn the existing NFT first before reissuing")
    await client.disconnect()
    return
  }

  console.log("✅ No active NFT found — safe to reissue")

  // ---- STEP 5: MINT FRESH NFT --------------------------
  // This is identical to the original mint process.
  // A fresh NFT with a new NFTokenID gets created.
  // The patient gets a brand new credential for their
  // new 30 day membership cycle.
  console.log("\n⏳ Minting fresh NFT for renewal...")

  const uri = xrpl.convertStringToHex(
    `https://carechainnft.com/metadata/${tier.toLowerCase()}`
  )

  const mintTx = await client.autofill({
    TransactionType: "NFTokenMint",
    Account: minterWallet.address,
    Issuer: treasuryWallet.address,
    URI: uri,
    Flags: NFT_FLAGS,
    NFTokenTaxon: tierConfig.taxon,
    TransferFee: tierConfig.transferFee
  })

  // Minter wallet signs — treasury stays protected
  const signedMintTx = minterWallet.sign(mintTx)
  const mintResult = await client.submitAndWait(signedMintTx.tx_blob)

  console.log("✅ Mint result:",
    mintResult.result.meta.TransactionResult)

  // ---- STEP 6: GET NEW NFT ID --------------------------
  // Find the newly minted NFT on the minter wallet
  // We filter by taxon to find the right tier
  // .pop() gets the most recently minted one
  const minterNFTs = await client.request({
    command: "account_nfts",
    account: minterWallet.address
  })

  const newNFT = minterNFTs.result.account_nfts
    .filter(nft => nft.NFTokenTaxon === tierConfig.taxon)
    .pop()

  if (!newNFT) {
    console.error("❌ Could not find newly minted NFT")
    await client.disconnect()
    return
  }

  console.log("✅ New NFT minted:", newNFT.NFTokenID)

  // ---- STEP 7: CREATE TRANSFER OFFER -------------------
  // Create a sell offer for 0 XRP directed specifically
  // at the patient's wallet address.
  // Only the patient can accept this offer.
  // This delivers the fresh NFT to the patient.
  console.log("\n⏳ Creating transfer offer for patient wallet...")

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

  // Get the offer ID from transaction metadata
  const offerNode = offerResult.result.meta.AffectedNodes
    .find(node => node.CreatedNode?.LedgerEntryType === "NFTokenOffer")

  const offerID = offerNode?.CreatedNode?.NewFields?.index ||
    offerNode?.CreatedNode?.LedgerIndex

  // ---- STEP 8: CALCULATE NEXT RENEWAL DATE -------------
  // We calculate and display when the next renewal
  // will be due — 30 days from today.
  // This date gets stored in your backend database
  // so the renewal scheduler knows when to trigger
  // the next burn and reissue cycle.
  const today = new Date()
  const nextRenewal = new Date(today.setDate(today.getDate() + 30))
  const nextRenewalDate = nextRenewal.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric"
  })

  // ---- STEP 9: DISPLAY SUMMARY -------------------------
  console.log("\n==========================================")
  console.log("       CARECHAIN NFT REISSUE SUMMARY     ")
  console.log("==========================================")
  console.log("Tier:", tierConfig.name)
  console.log("New NFTokenID:", newNFT.NFTokenID)
  console.log("Issuer (Treasury):", treasuryWallet.address)
  console.log("Minted By:", minterWallet.address)
  console.log("Patient Wallet:", patientWalletAddress)
  console.log("Transfer Offer ID:", offerID)
  console.log("Next Renewal Due:", nextRenewalDate)
  console.log("------------------------------------------")
  console.log("STATUS: ✅ NFT REISSUED SUCCESSFULLY")
  console.log("Patient must accept the offer in Xaman")
  console.log("to receive their renewed membership NFT")
  console.log("==========================================\n")

  // ---- STEP 10: DISCONNECT -----------------------------
  await client.disconnect()
  console.log("✅ Disconnected from XRPL Testnet")

  // Return key data for backend database storage
  return {
    nftokenID: newNFT.NFTokenID,
    offerID: offerID,
    tier: tierConfig.name,
    patientWallet: patientWalletAddress,
    nextRenewalDate: nextRenewalDate
  }
}

// ---- TEST THE REISSUE SCRIPT -------------------------
// We're reissuing a Diamond tier NFT to the minter wallet
// In production this will be the patient's Xaman wallet
const testTier = "diamond"
const testPatientWallet = process.env.TREASURY_WALLET_ADDRESS

reissueNFT(testTier, testPatientWallet)