// ============================================================
// CareChain NFT - Update Health Record URI Script
// Purpose: Update the URI on a patient's Health Record NFT
// when their health records change.
//
// WHEN THIS RUNS:
// - New lab results are added to the patient's record
// - New diagnosis or treatment plan is documented
// - New referral or prescription is issued
// - Any significant update to the patient's health record
//
// HOW IT WORKS:
// The NFT stays the same — same NFTokenID, same patient,
// same permanent credential. Only the URI pointer changes
// to reflect the latest version of the encrypted record.
// This is why we set tfMutable when we minted the NFT.
//
// HIPAA NOTE:
// The URI points to encrypted off-chain storage.
// No PHI is stored on the chain at any point.
// The update simply moves the pointer to the latest
// version of the encrypted record file.
// ============================================================

require("dotenv").config()
const xrpl = require("../../node_modules/xrpl")

const RECORD_NFT_TAXON = 99

async function updateRecordURI(patientWalletAddress, newRecordVersion) {

  // ---- STEP 1: VALIDATE INPUT ---------------------------
  if (!patientWalletAddress) {
    console.error("❌ Patient wallet address is required")
    return
  }
  if (!newRecordVersion) {
    console.error("❌ New record version is required")
    return
  }

  console.log("\n⏳ Updating Health Record NFT URI...")
  console.log("   Patient Wallet:", patientWalletAddress)
  console.log("   New Record Version:", newRecordVersion)

  // ---- STEP 2: CONNECT TO TESTNET -----------------------
  const client = new xrpl.Client("wss://s.altnet.rippletest.net:51233")
  await client.connect()
  console.log("✅ Connected to XRPL Testnet")

  // ---- STEP 3: LOAD TREASURY WALLET -------------------
  // The treasury wallet is the issuer — only the issuer
  // can update the URI on a mutable NFT
  const treasuryWallet = xrpl.Wallet.fromSeed(
    process.env.TREASURY_WALLET_SEED
  )

  console.log("✅ Treasury wallet loaded")
  console.log("   Address:", treasuryWallet.address)

  // ---- STEP 4: FIND THE PATIENT'S HEALTH RECORD NFT ---
  // We search the patient's wallet for their record NFT
  // identified by taxon 99 and issued by our treasury
  console.log("\n⏳ Finding patient Health Record NFT...")

  const patientNFTs = await client.request({
    command: "account_nfts",
    account: patientWalletAddress
  })

  const recordNFT = patientNFTs.result.account_nfts.find(
    nft => nft.NFTokenTaxon === RECORD_NFT_TAXON &&
           nft.Issuer === treasuryWallet.address
  )

  if (!recordNFT) {
    console.error("❌ No Health Record NFT found for this patient")
    console.error("   Run mint-record-nft.js first to create one")
    await client.disconnect()
    return
  }

  console.log("✅ Health Record NFT found")
  console.log("   NFTokenID:", recordNFT.NFTokenID)

  // Decode and display the current URI
  const currentURI = recordNFT.URI
    ? xrpl.convertHexToString(recordNFT.URI)
    : "No URI set"
  console.log("   Current URI:", currentURI)

  // ---- STEP 5: BUILD THE NEW URI ----------------------
  // The new URI includes a version number so providers
  // always know they're looking at the latest record.
  // Version format: v1, v2, v3 etc.
  // Each version points to the latest encrypted record file
  const newURI = xrpl.convertStringToHex(
    `https://records.carechainnft.com/patient/${patientWalletAddress}/v${newRecordVersion}`
  )

  console.log("   New URI:", `https://records.carechainnft.com/patient/${patientWalletAddress}/v${newRecordVersion}`)

  // ---- STEP 6: SUBMIT THE URI UPDATE ------------------
  // NFTokenModify is the transaction type for updating
  // a mutable NFT's URI. This is only possible because
  // we set tfMutable=true when we minted the record NFT.
  // The treasury wallet signs this as the original issuer.
  console.log("\n⏳ Submitting URI update to XRPL...")

  const updateTx = await client.autofill({
    TransactionType: "NFTokenModify",
    Account: treasuryWallet.address,
    NFTokenID: recordNFT.NFTokenID,
    URI: newURI
  })

  const signedUpdateTx = treasuryWallet.sign(updateTx)
  const updateResult = await client.submitAndWait(signedUpdateTx.tx_blob)

  console.log("✅ Update result:", updateResult.result.meta.TransactionResult)

  // ---- STEP 7: VERIFY THE UPDATE ----------------------
  // Query the NFT again to confirm the URI was updated
  console.log("\n⏳ Verifying URI update on ledger...")

  const updatedNFTs = await client.request({
    command: "account_nfts",
    account: patientWalletAddress
  })

  const updatedNFT = updatedNFTs.result.account_nfts.find(
    nft => nft.NFTokenID === recordNFT.NFTokenID
  )

  const verifiedURI = updatedNFT?.URI
    ? xrpl.convertHexToString(updatedNFT.URI)
    : "URI not found"

  // ---- STEP 8: DISPLAY SUMMARY ------------------------
  console.log("\n==========================================")
  console.log("      HEALTH RECORD URI UPDATE SUMMARY   ")
  console.log("==========================================")
  console.log("NFTokenID:", recordNFT.NFTokenID)
  console.log("Patient Wallet:", patientWalletAddress)
  console.log("------------------------------------------")
  console.log("Previous URI:", currentURI)
  console.log("Updated URI:", verifiedURI)
  console.log("Record Version: v" + newRecordVersion)
  console.log("------------------------------------------")
  console.log("PHI ON CHAIN: ❌ NONE — HIPAA compliant")
  console.log("------------------------------------------")
  if (verifiedURI.includes(`v${newRecordVersion}`)) {
    console.log("STATUS: ✅ URI UPDATED SUCCESSFULLY")
    console.log("Patient's health record pointer is current")
  } else {
    console.log("STATUS: ⚠️  VERIFY MANUALLY")
    console.log("Check transaction hash for confirmation")
  }
  console.log("==========================================\n")

  // ---- STEP 9: DISCONNECT -----------------------------
  await client.disconnect()
  console.log("✅ Disconnected from XRPL Testnet")

  return {
    nftokenID: recordNFT.NFTokenID,
    patientWallet: patientWalletAddress,
    previousURI: currentURI,
    newURI: verifiedURI,
    version: newRecordVersion
  }
}

// ---- TEST THE UPDATE SCRIPT -------------------------
// Using treasury wallet as test patient
// Version 2 simulates a record update after new lab results
const testPatientWallet = process.env.MINTER_WALLET_ADDRESS
const testVersion = "2"

updateRecordURI(testPatientWallet, testVersion)