// ============================================================
// CareChain NFT - Authorize Minter Script
// Purpose: Establish the official relationship between the
// treasury wallet (issuer) and the minter wallet on the XRPL
//
// KEY LESSON: The XRPL requires NFTokenMinter and SetFlag
// to be sent in ONE single transaction — not separately.
// Sending them separately causes a temMalformed error.
// ============================================================

require("dotenv").config()
const xrpl = require("../../node_modules/xrpl")

async function authorizeMinter() {

  // ---- STEP 1: CONNECT TO TESTNET -------------------------
  const client = new xrpl.Client("wss://s.altnet.rippletest.net:51233")
  await client.connect()
  console.log("✅ Connected to XRPL Testnet")

  // ---- STEP 2: LOAD WALLETS FROM .env ---------------------
  // Wallet.fromSeed() reconstructs the full wallet object
  // from the seed — giving us signing capability
  const treasuryWallet = xrpl.Wallet.fromSeed(
    process.env.TREASURY_WALLET_SEED
  )
  const minterWallet = xrpl.Wallet.fromSeed(
    process.env.MINTER_WALLET_SEED
  )

  console.log("✅ Wallets loaded from .env")
  console.log("   Treasury:", treasuryWallet.address)
  console.log("   Minter:", minterWallet.address)

  // ---- STEP 3: AUTHORIZE MINTER IN ONE TRANSACTION --------
  // CRITICAL: NFTokenMinter and SetFlag must be in the
  // SAME transaction. The XRPL rejects them if sent separately.
  //
  // NFTokenMinter = the address we're authorizing to mint
  // SetFlag 10 = asfAuthorizedNFTokenMinter
  // Both fields together tell the ledger:
  // "This specific address is my authorized minter"
  console.log("\n⏳ Authorizing minter wallet on treasury account...")

  const authTx = await client.autofill({
    TransactionType: "AccountSet",
    Account: treasuryWallet.address,
    NFTokenMinter: minterWallet.address,
    SetFlag: xrpl.AccountSetAsfFlags.asfAuthorizedNFTokenMinter
  })

  // Sign with treasury wallet — proves this came from the
  // legitimate treasury owner
  const signedAuthTx = treasuryWallet.sign(authTx)

  // Submit and wait for ledger validation
  const authResult = await client.submitAndWait(signedAuthTx.tx_blob)
  console.log("✅ Authorization result:",
    authResult.result.meta.TransactionResult)

  // ---- STEP 4: VERIFY ON LEDGER ---------------------------
  // Query the treasury account to confirm the minter
  // address is now visible on the ledger
  console.log("\n⏳ Verifying authorization on ledger...")

  const accountInfo = await client.request({
    command: "account_info",
    account: treasuryWallet.address,
    ledger_index: "validated"
  })

  const accountData = accountInfo.result.account_data

  // ---- STEP 5: DISPLAY SUMMARY ----------------------------
  console.log("\n==========================================")
  console.log("       MINTER AUTHORIZATION SUMMARY      ")
  console.log("==========================================")
  console.log("TREASURY WALLET")
  console.log("Address:", treasuryWallet.address)
  console.log("Authorized Minter:", accountData.NFTokenMinter)
  console.log("------------------------------------------")
  console.log("MINTER WALLET")
  console.log("Address:", minterWallet.address)
  console.log("------------------------------------------")
  if (accountData.NFTokenMinter === minterWallet.address) {
    console.log("Authorization Status: ✅ CONFIRMED ON LEDGER")
  } else {
    console.log("Authorization Status: ❌ NOT CONFIRMED - CHECK ERROR")
  }
  console.log("==========================================")
  console.log("The minter wallet can now mint NFTs on")
  console.log("behalf of the treasury wallet.")
  console.log("==========================================\n")

  // ---- STEP 6: DISCONNECT ---------------------------------
  await client.disconnect()
  console.log("✅ Disconnected from XRPL Testnet")
}

authorizeMinter().catch(console.error)