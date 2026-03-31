// ============================================================
// CareChain NFT - Admin Dashboard
// Purpose: Central control panel for managing a clinic's
// CareChain NFT membership program. This is what clinic
// staff uses day to day to run the program.
//
// FUNCTIONS:
// - enrollPatient: mint a new NFT and add patient to roster
// - revokePatient: burn an NFT and remove from active roster
// - renewPatient: burn expired NFT and reissue a fresh one
// - viewDashboard: see all active members and metrics
// - lookupPatient: check a specific patient's status
//
// KEY CONCEPT: This script imports and combines all the
// previous scripts we built into one unified interface.
// This is called MODULARITY — each script does one job
// and the dashboard orchestrates them all together.
// ============================================================

require("dotenv").config()
const xrpl = require("../../node_modules/xrpl")
const fs = require("fs")
const path = require("path")

// ---- IMPORT OUR PREVIOUSLY BUILT MODULES ----------------
// require() here loads the functions we already built
// and exported from their respective scripts.
// This is why we added module.exports at the bottom
// of institution-config.js — so we could use it here.
const {
  loadInstitution,
  updateMetrics,
  addPatient,
  displayInstitutionSummary
} = require("./institution-config")

// ---- TIER CONFIGURATIONS --------------------------------
const TIERS = {
  diamond: { name: "Diamond", taxon: 0, transferFee: 0 },
  gold:    { name: "Gold",    taxon: 1, transferFee: 0 },
  silver:  { name: "Silver",  taxon: 2, transferFee: 0 }
}

const NFT_FLAGS = 1

// ---- ENROLL PATIENT -------------------------------------
// This is the full enrollment flow in one function:
// 1. Mint a new tier NFT
// 2. Create a transfer offer to the patient wallet
// 3. Add patient to the institution roster
// 4. Update institution metrics
//
// In production this gets triggered automatically
// when a patient completes payment on the portal.
async function enrollPatient(institutionID, tier, patientWalletAddress) {

  console.log("\n==========================================")
  console.log("         ENROLLING NEW PATIENT           ")
  console.log("==========================================")
  console.log("Institution:", institutionID)
  console.log("Tier:", tier.toUpperCase())
  console.log("Patient Wallet:", patientWalletAddress)
  console.log("==========================================\n")

  // Load institution to verify it exists and get pricing
  const institution = loadInstitution(institutionID)
  if (!institution) return null

  // Validate tier
  const tierConfig = TIERS[tier.toLowerCase()]
  if (!tierConfig) {
    console.error("❌ Invalid tier:", tier)
    return null
  }

  // Get the monthly price for this tier at this institution
  // This is what gets recorded in the metrics
  const monthlyPrice = institution.tiers[tier.toLowerCase()].monthlyPrice

  // Check if tier is at capacity
  const activeMembers = institution.tiers[tier.toLowerCase()].activeMembers
  const maxMembers = institution.tiers[tier.toLowerCase()].maxMembers

  if (activeMembers >= maxMembers) {
    console.error(`❌ ${tierConfig.name} tier is at capacity`)
    console.error(`   ${activeMembers}/${maxMembers} members enrolled`)
    return null
  }

  // ---- CONNECT AND LOAD WALLETS ------------------------
  const client = new xrpl.Client("wss://s.altnet.rippletest.net:51233")
  await client.connect()
  console.log("✅ Connected to XRPL Testnet")

  const treasuryWallet = xrpl.Wallet.fromSeed(
    process.env.TREASURY_WALLET_SEED
  )
  const minterWallet = xrpl.Wallet.fromSeed(
    process.env.MINTER_WALLET_SEED
  )

  // ---- MINT THE NFT ------------------------------------
  // Minter wallet mints on behalf of treasury wallet
  console.log("⏳ Minting membership NFT...")

  const uri = xrpl.convertStringToHex(
    `https://carechainnft.com/metadata/${tier.toLowerCase()}/${institutionID}`
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

  const signedMintTx = minterWallet.sign(mintTx)
  const mintResult = await client.submitAndWait(signedMintTx.tx_blob)
  console.log("✅ Mint result:", mintResult.result.meta.TransactionResult)

  // ---- GET NEW NFT ID ----------------------------------
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
    return null
  }

  console.log("✅ NFT minted:", newNFT.NFTokenID)

  // ---- CREATE TRANSFER OFFER ---------------------------
  // Send the NFT to the patient's wallet
  console.log("⏳ Creating transfer offer for patient...")

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

  // Get offer ID
  const offerNode = offerResult.result.meta.AffectedNodes
    .find(node => node.CreatedNode?.LedgerEntryType === "NFTokenOffer")
  const offerID = offerNode?.CreatedNode?.NewFields?.index ||
    offerNode?.CreatedNode?.LedgerIndex

  // ---- CALCULATE RENEWAL DATE --------------------------
  const today = new Date()
  const nextRenewal = new Date(today.setDate(today.getDate() + 30))
  const nextRenewalDate = nextRenewal.toISOString().split("T")[0]

  // ---- UPDATE INSTITUTION RECORDS ----------------------
  // Add patient to institution roster
  addPatient(institutionID, {
    walletAddress: patientWalletAddress,
    tier: tierConfig.name,
    nftokenID: newNFT.NFTokenID,
    nextRenewal: nextRenewalDate
  })

  // Update institution metrics
  updateMetrics(institutionID, "mint", tier.toLowerCase(), monthlyPrice)

  // ---- DISCONNECT --------------------------------------
  await client.disconnect()

  // ---- DISPLAY RESULT ----------------------------------
  console.log("\n==========================================")
  console.log("         ENROLLMENT COMPLETE             ")
  console.log("==========================================")
  console.log("Institution:", institution.name)
  console.log("Patient Wallet:", patientWalletAddress)
  console.log("Tier:", tierConfig.name)
  console.log("NFTokenID:", newNFT.NFTokenID)
  console.log("Transfer Offer ID:", offerID)
  console.log("Next Renewal:", nextRenewalDate)
  console.log("Monthly Revenue Added: $" + monthlyPrice)
  console.log("------------------------------------------")
  console.log("STATUS: ✅ PATIENT ENROLLED SUCCESSFULLY")
  console.log("Patient must accept offer in Xaman wallet")
  console.log("==========================================\n")

  return {
    nftokenID: newNFT.NFTokenID,
    offerID: offerID,
    tier: tierConfig.name,
    nextRenewal: nextRenewalDate
  }
}

// ---- REVOKE PATIENT -------------------------------------
// Burns a patient's NFT and updates their status
// Called when: payment fails, patient cancels,
// or institution removes a patient
async function revokePatient(institutionID, patientWalletAddress, nftokenID) {

  console.log("\n==========================================")
  console.log("         REVOKING PATIENT MEMBERSHIP     ")
  console.log("==========================================")
  console.log("Institution:", institutionID)
  console.log("Patient Wallet:", patientWalletAddress)
  console.log("==========================================\n")

  const institution = loadInstitution(institutionID)
  if (!institution) return null

  // Find patient in roster to get their tier
  const patient = institution.patients
    .find(p => p.walletAddress === patientWalletAddress)

  if (!patient) {
    console.error("❌ Patient not found in institution roster")
    return null
  }

  // Connect and load treasury wallet for burning
  const client = new xrpl.Client("wss://s.altnet.rippletest.net:51233")
  await client.connect()

  const treasuryWallet = xrpl.Wallet.fromSeed(
    process.env.TREASURY_WALLET_SEED
  )

  // Burn the NFT
  console.log("⏳ Burning membership NFT...")

  const burnTx = await client.autofill({
    TransactionType: "NFTokenBurn",
    Account: treasuryWallet.address,
    NFTokenID: nftokenID,
    Owner: patientWalletAddress
  })

  const signedBurnTx = treasuryWallet.sign(burnTx)
  const burnResult = await client.submitAndWait(signedBurnTx.tx_blob)
  console.log("✅ Burn result:", burnResult.result.meta.TransactionResult)

  // Update patient status in roster
  patient.status = "inactive"
  patient.revokeDate = new Date().toISOString().split("T")[0]

  // Save updated institution
  const filePath = path.join(
    __dirname,
    `../../data/institutions/${institutionID}.json`
  )
  fs.writeFileSync(filePath, JSON.stringify(institution, null, 2))

  // Update metrics
  const tier = Object.keys(TIERS)
    .find(t => TIERS[t].name === patient.tier)
  const monthlyPrice = institution.tiers[tier].monthlyPrice
  updateMetrics(institutionID, "burn", tier, monthlyPrice)

  await client.disconnect()

  console.log("\n==========================================")
  console.log("         REVOCATION COMPLETE             ")
  console.log("==========================================")
  console.log("STATUS: ✅ MEMBERSHIP REVOKED")
  console.log("Patient no longer has active membership")
  console.log("==========================================\n")

  return { revoked: true, patientWallet: patientWalletAddress }
}

// ---- VIEW DASHBOARD -------------------------------------
// Displays complete institution dashboard
// This is what the clinic admin sees when they log in
function viewDashboard(institutionID) {
  const institution = loadInstitution(institutionID)
  if (!institution) return

  const activePatients = institution.patients
    .filter(p => p.status === "active")

  const inactivePatients = institution.patients
    .filter(p => p.status === "inactive")

  console.log("\n==========================================")
  console.log("       CARECHAIN ADMIN DASHBOARD         ")
  console.log("==========================================")
  console.log("Institution:", institution.name)
  console.log("Location:", institution.location)
  console.log("Status:", institution.status.toUpperCase())
  console.log("------------------------------------------")
  console.log("SUBSCRIPTION TIERS")
  console.log("------------------------------------------")
  Object.entries(institution.tiers).forEach(([key, tier]) => {
    console.log(`${tier.name}:  $${tier.monthlyPrice}/month`)
    console.log(`   Active: ${tier.activeMembers}/${tier.maxMembers} members`)
  })
  console.log("------------------------------------------")
  console.log("REVENUE METRICS")
  console.log("------------------------------------------")
  console.log("Monthly Revenue:  $" + institution.metrics.monthlyRevenue)
  console.log("Total Revenue:    $" + institution.metrics.totalRevenue)
  console.log("------------------------------------------")
  console.log("MEMBERSHIP METRICS")
  console.log("------------------------------------------")
  console.log("Total Enrolled:   ", institution.metrics.totalMinted)
  console.log("Total Revoked:    ", institution.metrics.totalBurned)
  console.log("Total Renewed:    ", institution.metrics.totalReissued)
  console.log("Active Members:   ", activePatients.length)
  console.log("Inactive Members: ", inactivePatients.length)
  console.log("------------------------------------------")
  if (activePatients.length > 0) {
    console.log("ACTIVE MEMBERS")
    console.log("------------------------------------------")
    activePatients.forEach((patient, index) => {
      console.log(`${index + 1}. ${patient.tier} Tier`)
      console.log(`   Wallet: ${patient.walletAddress}`)
      console.log(`   Renewal: ${patient.nextRenewal}`)
    })
  }
  console.log("==========================================\n")
}

// ---- TEST THE ADMIN DASHBOARD ------------------------
// Enroll a test patient then view the dashboard
async function runTest() {

  console.log("🚀 CareChain Admin Dashboard - Test Run")
  console.log("==========================================\n")

  // Step 1: Enroll a test patient as Gold tier
  // Using treasury wallet as test patient
  await enrollPatient(
    "PILOT_001",
    "gold",
    process.env.TREASURY_WALLET_ADDRESS
  )

  // Step 2: View the dashboard after enrollment
  viewDashboard("PILOT_001")
}

runTest()

// Export functions for use in other scripts
module.exports = {
  enrollPatient,
  revokePatient,
  viewDashboard
}