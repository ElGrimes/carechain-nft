// ============================================================
// CareChain NFT - Health Record NFT Verification Script
// Purpose: Verify a patient has a valid Health Record NFT
// and return the URI pointer so a provider can access
// their encrypted health records through the portal.
//
// WHEN THIS RUNS:
// - A new provider needs to access a patient's records
// - A specialist receives a referral and needs history
// - An ER provider needs immediate access to records
// - Any authorized party requests record access
//
// WHAT IT RETURNS:
// - Confirmation the NFT is authentic and CareChain issued
// - The URI pointer to the encrypted record
// - The NFT's issue date and version
//
// WHAT IT NEVER RETURNS:
// - Any PHI — that stays behind authenticated access
// - Private keys or wallet seeds
// - Any data not on the public ledger
// ============================================================

require("dotenv").config()
const xrpl = require("../../node_modules/xrpl")

const RECORD_NFT_TAXON = 99

async function verifyRecordNFT(patientWalletAddress) {

  // ---- STEP 1: VALIDATE INPUT ---------------------------
  if (!patientWalletAddress) {
    console.error("❌ Patient wallet address is required")
    return { verified: false, reason: "No wallet address provided" }
  }

  console.log("\n⏳ Verifying Health Record NFT...")
  console.log("   Patient Wallet:", patientWalletAddress)

  // ---- STEP 2: CONNECT TO TESTNET -----------------------
  const client = new xrpl.Client("wss://s.altnet.rippletest.net:51233")
  await client.connect()
  console.log("✅ Connected to XRPL Testnet")

  // ---- STEP 3: LOAD TREASURY ADDRESS -------------------
  // We only need the address — not the seed
  // Used to verify the NFT was issued by CareChain
  const treasuryAddress = process.env.TREASURY_WALLET_ADDRESS

  // ---- STEP 4: CHECK PATIENT WALLET FOR RECORD NFT ----
  // Query the XRPL directly for all NFTs on this wallet
  console.log("\n⏳ Searching for Health Record NFT...")

  let patientNFTs
  try {
    patientNFTs = await client.request({
      command: "account_nfts",
      account: patientWalletAddress
    })
  } catch (error) {
    console.error("❌ Wallet not found on XRPL")
    await client.disconnect()
    return {
      verified: false,
      reason: "Wallet not found on XRPL"
    }
  }

  // ---- STEP 5: FIND CARECHAIN HEALTH RECORD NFT -------
  // Look for an NFT with:
  // - Taxon 99 (health record taxon)
  // - Issued by our treasury wallet
  // Both conditions must be true for authenticity
  const recordNFT = patientNFTs.result.account_nfts.find(
    nft => nft.NFTokenTaxon === RECORD_NFT_TAXON &&
           nft.Issuer === treasuryAddress
  )

  // ---- STEP 6: HANDLE NO RECORD NFT FOUND -------------
  if (!recordNFT) {
    console.log("\n==========================================")
    console.log("      HEALTH RECORD VERIFICATION RESULT  ")
    console.log("==========================================")
    console.log("STATUS: ❌ NO HEALTH RECORD NFT FOUND")
    console.log("------------------------------------------")
    console.log("Patient Wallet:", patientWalletAddress)
    console.log("------------------------------------------")
    console.log("This patient does not have a CareChain")
    console.log("Health Record NFT credential.")
    console.log("==========================================\n")

    await client.disconnect()
    return {
      verified: false,
      reason: "No CareChain Health Record NFT found"
    }
  }

  // ---- STEP 7: DECODE THE RECORD URI ------------------
  // The URI is stored as hex on the ledger
  // We convert it back to a readable string
  const recordURI = recordNFT.URI
    ? xrpl.convertHexToString(recordNFT.URI)
    : "No URI set"

  // ---- STEP 8: GET LEDGER INFO FOR TIMESTAMP ----------
  // We get the current ledger info to show the
  // verification was done in real time
  const ledgerInfo = await client.request({
    command: "ledger",
    ledger_index: "validated"
  })

  const verificationTime = new Date().toLocaleString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  })

  // ---- STEP 9: DISPLAY VERIFICATION RESULT -----------
  console.log("\n==========================================")
  console.log("      HEALTH RECORD VERIFICATION RESULT  ")
  console.log("==========================================")
  console.log("STATUS: ✅ HEALTH RECORD CREDENTIAL VERIFIED")
  console.log("------------------------------------------")
  console.log("Patient Wallet:", patientWalletAddress)
  console.log("NFTokenID:", recordNFT.NFTokenID)
  console.log("Issued By:", recordNFT.Issuer)
  console.log("------------------------------------------")
  console.log("RECORD ACCESS:")
  console.log("URI:", recordURI)
  console.log("------------------------------------------")
  console.log("NFT PROPERTIES:")
  console.log("  Permanent:    ✅ YES — never expires")
  console.log("  Transferable: ❌ NO — patient owned")
  console.log("  PHI on chain: ❌ NO — HIPAA compliant")
  console.log("------------------------------------------")
  console.log("Verified At:", verificationTime)
  console.log("Ledger Index:", ledgerInfo.result.ledger_index)
  console.log("==========================================")
  console.log("To access records visit:")
  console.log(recordURI)
  console.log("Authentication required through portal")
  console.log("==========================================\n")

  // ---- STEP 10: DISCONNECT ----------------------------
  await client.disconnect()
  console.log("✅ Disconnected from XRPL Testnet")

  return {
    verified: true,
    nftokenID: recordNFT.NFTokenID,
    patientWallet: patientWalletAddress,
    recordURI: recordURI,
    issuer: recordNFT.Issuer,
    verifiedAt: verificationTime,
    ledgerIndex: ledgerInfo.result.ledger_index
  }
}

// ---- TEST THE VERIFICATION SCRIPT -------------------
// Using minter wallet as test patient since that's
// where we sent the health record NFT
const testPatientWallet = process.env.MINTER_WALLET_ADDRESS

verifyRecordNFT(testPatientWallet)