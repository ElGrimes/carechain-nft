// ============================================================
// CareChain NFT - Check Wallet Balances
// Purpose: Verify both wallets exist and are funded on testnet
// ============================================================

// dotenv loads your .env file so we can access the wallet 
// addresses we saved there without hardcoding them here
require("dotenv").config()
const xrpl = require("../../node_modules/xrpl")

async function checkBalances() {

  // Connect to testnet
  const client = new xrpl.Client("wss://s.altnet.rippletest.net:51233")
  await client.connect()
  console.log("✅ Connected to XRPL Testnet")

  // getXrpBalance() takes a wallet address and returns
  // how much XRP that account currently holds
  const treasuryBalance = await client.getXrpBalance(
    process.env.TREASURY_WALLET_ADDRESS
  )
  
  const minterBalance = await client.getXrpBalance(
    process.env.MINTER_WALLET_ADDRESS
  )

  // Display results
  console.log("\n==========================================")
  console.log("         CARECHAIN WALLET BALANCES       ")
  console.log("==========================================")
  console.log("TREASURY WALLET")
  console.log("Address:", process.env.TREASURY_WALLET_ADDRESS)
  console.log("Balance:", treasuryBalance, "XRP")
  console.log("------------------------------------------")
  console.log("MINTER WALLET")
  console.log("Address:", process.env.MINTER_WALLET_ADDRESS)
  console.log("Balance:", minterBalance, "XRP")
  console.log("==========================================\n")

  await client.disconnect()
  console.log("✅ Done")
}

checkBalances().catch(console.error)