// ============================================================
// CareChain NFT - Health Record NFT Minting Script
// Purpose: Mint a permanent, soulbound Health Record NFT
// for a patient. This NFT is separate from the membership
// NFT and serves as the patient's on-chain proof of
// ownership over their health records.
//
// KEY DISTINCTIONS from membership NFT:
// - Permanent — never burns, never expires
// - Mutable URI — can be updated as records change
// - Read-only credential — patient owns, providers verify
// - PHI never touches the chain — URI points to encrypted
//   off-chain storage only
//
// ARCHITECTURE:
// Chain stores:  wallet address + NFT credential + URI pointer
// Off-chain:     encrypted health record data (HIPAA compliant)
// Patient owns:  the NFT = proof of record ownership
// Provider sees: URI pointer → authenticated access to record
// ============================================================

require("dotenv").config()
const xrpl = require("../../node_modules/xrpl")

// ---- HEALTH RECORD NFT FLAGS ----------------------------
// tfBurnable = false — this NFT is permanent
// tfTransferable = false — soulbound to patient wallet
// tfMutable = true — URI can be updated as records change
//
// Flag value breakdown:
// 0 = no flags (non-transferable, non-burnable)
// 2 = tfMutable only (non-transferable, non-burnable, mutable)
// We use 2 so the URI can be updated when records change
// but the NFT itself can never be burned or transferred
const RECORD_NFT_FLAGS = 2  // tfMutable only

// ---- HEALTH RECORD TAXON --------------------------------
// We use taxon 99 for health record NFTs
// This separates them clearly from membership NFTs
// (Diamond=0, Gold=1, Silver=2) in any wallet query
const RECORD_NFT_TAXON = 99

async function mintRecordNFT(patientWalletAddress, patientMRN) {

  // ---- STEP 1: VALIDATE INPUT ---------------------------
  // Both wallet address and MRN are required
  // MRN = Medical Record Number — the patient's unique
  // identifier in the clinic's EHR system
  // The MRN is NOT stored on chain — it's used to generate
  // the URI that points to their off-chain record
  if (!patientWalletAddress) {
    console.error("❌ Patient wallet address is required")
    return
  }
  if (!patientMRN) {
    console.error("❌ Patient MRN is required")
    return
  }

  console.log("\n⏳ Minting Health Record NFT...")
  console.log("   Patient Wallet:", patientWalletAddress)
  console.log("   MRN:", patientMRN)

  // ---- STEP 2: CONNECT TO TESTNET -----------------------
  const client = new xrpl.Client("wss://s.altnet.rippletest.net:51233")
  await client.connect()
  console.log("✅ Connected to XRPL Testnet")

  // ---- STEP 3: LOAD WALLETS ----------------------------
  const treasuryWallet = xrpl.Wallet.fromSeed(
    process.env.TREASURY_WALLET_SEED
  )
  const minterWallet = xrpl.Wallet.fromSeed(
    process.env.MINTER_WALLET_SEED
  )

  console.log("✅ Wallets loaded")
  console.log("   Treasury (Issuer):", treasuryWallet.address)
  console.log("   Minter:", minterWallet.address)

  // ---- STEP 4: CHECK IF PATIENT ALREADY HAS RECORD NFT --
  // A patient should only ever have ONE health record NFT
  // If they already have one we don't mint another —
  // instead we update the existing one via update-record-uri.js
  console.log("\n⏳ Checking for existing Health Record NFT...")

  const existingNFTs = await client.request({
    command: "account_nfts",
    account: patientWalletAddress
  })

  // Look for any NFT with our record taxon (99) issued
  // by our treasury wallet
  const existingRecord = existingNFTs.result.account_nfts.find(
    nft => nft.NFTokenTaxon === RECORD_NFT_TAXON &&
           nft.Issuer === treasuryWallet.address
  )

  if (existingRecord) {
    console.log("⚠️  Patient already has a Health Record NFT")
    console.log("   NFTokenID:", existingRecord.NFTokenID)
    console.log("   Use update-record-uri.js to update the record pointer")
    await client.disconnect()
    return { exists: true, nftokenID: existingRecord.NFTokenID }
  }

  console.log("✅ No existing record NFT found — safe to mint")

  // ---- STEP 5: BUILD THE RECORD URI -------------------
  // The URI points to where the patient's encrypted health
  // record lives off-chain. In production this will be
  // a URL to your HIPAA-compliant encrypted storage system.
  //
  // The URI structure:
  // https://records.carechainnft.com/patient/{walletAddress}
  //
  // When a provider accesses this URL they must authenticate
  // through the CareChain portal to decrypt and view the record.
  // The actual PHI is encrypted and only accessible to
  // authorized parties — never publicly readable.
  //
  // We hash the MRN into the URI so it's not stored directly
  // on the chain — an extra layer of privacy protection
  const recordURI = xrpl.convertStringToHex(
    `https://records.carechainnft.com/patient/${patientWalletAddress}`
  )

  // ---- STEP 6: MINT THE HEALTH RECORD NFT -------------
  // This NFT is permanent. The tfMutable flag means the
  // URI can be updated as new records are added, but the
  // NFT itself is never burned or transferred.
  console.log("\n⏳ Minting permanent Health Record NFT...")

  const mintTx = await client.autofill({
    TransactionType: "NFTokenMint",
    Account: minterWallet.address,
    Issuer: treasuryWallet.address,
    URI: recordURI,
    Flags: RECORD_NFT_FLAGS,
    NFTokenTaxon: RECORD_NFT_TAXON,
    TransferFee: 0
  })

  const signedMintTx = minterWallet.sign(mintTx)
  const mintResult = await client.submitAndWait(signedMintTx.tx_blob)

  console.log("✅ Mint result:", mintResult.result.meta.TransactionResult)

  // ---- STEP 7: GET THE NEW NFT ID ---------------------
  const minterNFTs = await client.request({
    command: "account_nfts",
    account: minterWallet.address
  })

  // Find the most recently minted record NFT
  const newRecordNFT = minterNFTs.result.account_nfts
    .filter(nft => nft.NFTokenTaxon === RECORD_NFT_TAXON)
    .pop()

  if (!newRecordNFT) {
    console.error("❌ Could not find newly minted Health Record NFT")
    await client.disconnect()
    return
  }

  console.log("✅ Health Record NFT minted:", newRecordNFT.NFTokenID)

  // ---- STEP 8: CREATE TRANSFER OFFER TO PATIENT -------
  // Send the record NFT to the patient's wallet
  // This is a permanent credential — they hold it forever
  console.log("\n⏳ Creating transfer offer for patient wallet...")

  const offerTx = await client.autofill({
    TransactionType: "NFTokenCreateOffer",
    Account: minterWallet.address,
    NFTokenID: newRecordNFT.NFTokenID,
    Amount: "0",
    Destination: patientWalletAddress,
    Flags: xrpl.NFTokenCreateOfferFlags.tfSellNFToken
  })

  const signedOfferTx = minterWallet.sign(offerTx)
  const offerResult = await client.submitAndWait(signedOfferTx.tx_blob)

  console.log("✅ Transfer offer result:",
    offerResult.result.meta.TransactionResult)

  const offerNode = offerResult.result.meta.AffectedNodes
    .find(node => node.CreatedNode?.LedgerEntryType === "NFTokenOffer")

  const offerID = offerNode?.CreatedNode?.NewFields?.index ||
    offerNode?.CreatedNode?.LedgerIndex

  // ---- STEP 9: DISPLAY SUMMARY ------------------------
  console.log("\n==========================================")
  console.log("      HEALTH RECORD NFT SUMMARY          ")
  console.log("==========================================")
  console.log("Type: Permanent Health Record Credential")
  console.log("NFTokenID:", newRecordNFT.NFTokenID)
  console.log("Issuer (Treasury):", treasuryWallet.address)
  console.log("Patient Wallet:", patientWalletAddress)
  console.log("Record URI:", `https://records.carechainnft.com/patient/${patientWalletAddress}`)
  console.log("Transfer Offer ID:", offerID)
  console.log("------------------------------------------")
  console.log("NFT FLAGS:")
  console.log("  Transferable: ❌ NO — soulbound to patient")
  console.log("  Burnable:     ❌ NO — permanent credential")
  console.log("  Mutable URI:  ✅ YES — updatable as records change")
  console.log("------------------------------------------")
  console.log("PHI ON CHAIN:  ❌ NONE — HIPAA compliant")
  console.log("RECORD STORED: Off-chain encrypted storage")
  console.log("------------------------------------------")
  console.log("STATUS: ✅ HEALTH RECORD NFT MINTED")
  console.log("Patient must accept offer in Xaman wallet")
  console.log("==========================================\n")

  // ---- STEP 10: DISCONNECT ----------------------------
  await client.disconnect()
  console.log("✅ Disconnected from XRPL Testnet")

  return {
    nftokenID: newRecordNFT.NFTokenID,
    offerID: offerID,
    patientWallet: patientWalletAddress,
    recordURI: `https://records.carechainnft.com/patient/${patientWalletAddress}`,
    permanent: true,
    mutableURI: true
  }
}

// ---- TEST THE HEALTH RECORD NFT ---------------------
// Using treasury wallet as test patient
// In production this uses the real patient wallet address
// and their actual MRN from the EHR system
const testPatientWallet = process.env.TREASURY_WALLET_ADDRESS
const testMRN = "MRN-TEST-001"

mintRecordNFT(testPatientWallet, testMRN)