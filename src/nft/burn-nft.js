// ============================================================
// CareChain NFT - Burn Script
// Purpose: Burn an expired or cancelled membership NFT
// This is triggered when:
// - A patient's monthly payment fails
// - A patient cancels their membership
// - An institution removes a patient from the program
// - A membership needs to be revoked for any reason
//
// KEY CONCEPT: Because our NFTs are minted with tfBurnable=true
// the TREASURY wallet (issuer) can burn the NFT even though
// the PATIENT wallet currently holds it. This is what gives
// CareChain control over the renewal cycle.
// ============================================================

require("dotenv").config()
const xrpl = require("../../node_modules/xrpl")

async function burnNFT(nftokenID, patientWalletAddress) {

  // ---- STEP 1: VALIDATE INPUT ---------------------------
  // Make sure we have the required information before
  // connecting to the ledger and attempting anything
  if (!nftokenID) {
    console.error("❌ NFTokenID is required to burn an NFT")
    return
  }
  if (!patientWalletAddress) {
    console.error("❌ Patient wallet address is required")
    return
  }

  console.log("\n⏳ Initiating NFT burn...")
  console.log("   NFTokenID:", nftokenID)
  console.log("   Patient Wallet:", patientWalletAddress)

  // ---- STEP 2: CONNECT TO TESTNET -----------------------
  const client = new xrpl.Client("wss://s.altnet.rippletest.net:51233")
  await client.connect()
  console.log("✅ Connected to XRPL Testnet")

  // ---- STEP 3: LOAD TREASURY WALLET --------------------
  // The TREASURY wallet is the one that burns the NFT
  // because it is the original issuer.
  // Remember: tfBurnable=true means the issuer can burn
  // the NFT regardless of who currently holds it.
  // This is a critical architectural decision we made
  // when we set NFT_FLAGS = 1 in the mint script.
  const treasuryWallet = xrpl.Wallet.fromSeed(
    process.env.TREASURY_WALLET_SEED
  )

  console.log("✅ Treasury wallet loaded")
  console.log("   Address:", treasuryWallet.address)

  // ---- STEP 4: VERIFY NFT EXISTS ON PATIENT WALLET -----
  // Before burning we confirm the NFT actually exists
  // on the patient's wallet. This prevents errors from
  // trying to burn an NFT that doesn't exist or has
  // already been burned.
  console.log("\n⏳ Verifying NFT exists on patient wallet...")

  const patientNFTs = await client.request({
    command: "account_nfts",
    account: patientWalletAddress
  })

  // .find() searches through the array of NFTs looking
  // for one whose NFTokenID matches what we passed in
  const targetNFT = patientNFTs.result.account_nfts
    .find(nft => nft.NFTokenID === nftokenID)

  if (!targetNFT) {
    console.error("❌ NFT not found on patient wallet")
    console.error("   It may have already been burned or transferred")
    await client.disconnect()
    return
  }

  console.log("✅ NFT confirmed on patient wallet")
  console.log("   Taxon (Tier):", targetNFT.NFTokenTaxon)

  // ---- STEP 5: BUILD THE BURN TRANSACTION --------------
  // NFTokenBurn is the transaction type that destroys an NFT
  // Account: the treasury wallet — the issuer doing the burning
  // NFTokenID: the specific NFT to destroy
  // Owner: the patient wallet that currently holds the NFT
  //        This field is required when burning an NFT that
  //        is held by a different account than the burner
  console.log("\n⏳ Building burn transaction...")

  const burnTx = await client.autofill({
    TransactionType: "NFTokenBurn",
    Account: treasuryWallet.address,
    NFTokenID: nftokenID,
    Owner: patientWalletAddress
  })

  // ---- STEP 6: SIGN AND SUBMIT -------------------------
  // Treasury wallet signs — it's the issuer with burn rights
  const signedBurnTx = treasuryWallet.sign(burnTx)

  console.log("⏳ Submitting burn transaction to XRPL...")
  const burnResult = await client.submitAndWait(signedBurnTx.tx_blob)

  console.log("✅ Burn result:", 
    burnResult.result.meta.TransactionResult)

  // ---- STEP 7: VERIFY NFT IS GONE ----------------------
  // After burning we confirm the NFT no longer exists
  // on the patient's wallet. This is our confirmation
  // that the burn was successful.
  console.log("\n⏳ Verifying NFT has been burned...")

  const postBurnNFTs = await client.request({
    command: "account_nfts",
    account: patientWalletAddress
  })

  const nftStillExists = postBurnNFTs.result.account_nfts
    .find(nft => nft.NFTokenID === nftokenID)

  // ---- STEP 8: DISPLAY SUMMARY -------------------------
  console.log("\n==========================================")
  console.log("          CARECHAIN NFT BURN SUMMARY     ")
  console.log("==========================================")
  console.log("NFTokenID:", nftokenID)
  console.log("Patient Wallet:", patientWalletAddress)
  console.log("Burned By:", treasuryWallet.address)
  console.log("Transaction:", burnResult.result.hash)
  console.log("------------------------------------------")
  if (!nftStillExists) {
    console.log("STATUS: ✅ NFT SUCCESSFULLY BURNED")
    console.log("Membership access has been revoked")
    console.log("Patient wallet no longer holds this NFT")
  } else {
    console.log("STATUS: ❌ BURN MAY HAVE FAILED")
    console.log("Please check the transaction hash above")
  }
  console.log("==========================================\n")

  // ---- STEP 9: DISCONNECT ------------------------------
  await client.disconnect()
  console.log("✅ Disconnected from XRPL Testnet")

  // Return result for use in the reissue script
  return {
    burned: !nftStillExists,
    nftokenID: nftokenID,
    patientWallet: patientWalletAddress,
    txHash: burnResult.result.hash
  }
}

// ---- TEST THE BURN SCRIPT ----------------------------
// Using your actual NFTokenID from testnet
const testNFTokenID = "00010000025F179DA6A7C446B8217A9D02BC41AA2BEDB619C9678DBF00F62024"
const testPatientWallet = process.env.MINTER_WALLET_ADDRESS

burnNFT(testNFTokenID, testPatientWallet)