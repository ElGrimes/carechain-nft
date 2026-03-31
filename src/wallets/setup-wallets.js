// ============================================================
// CareChain NFT - Wallet Setup Script
// Purpose: Generate treasury and minter wallets on testnet
// and save seeds to .env file
// ============================================================

// require() is how we import tools in Node.js
// xrpl - lets us talk to the XRP Ledger
// fs - lets us read and write files on your computer
const xrpl = require("../../node_modules/xrpl")
const fs = require("fs")

async function setupWallets() {

  // ---- STEP 1: CONNECT TO TESTNET -------------------------
  // Creates a client that knows how to talk to XRPL testnet
  const client = new xrpl.Client("wss://s.altnet.rippletest.net:51233")
  
  // Opens the connection - await pauses until fully connected
  await client.connect()
  console.log("✅ Connected to XRPL Testnet")

  // ---- STEP 2: GENERATE TREASURY WALLET -------------------
  // fundWallet() generates a new wallet AND funds it with
  // 1000 free testnet XRP from the faucet automatically
  console.log("⏳ Generating Treasury Wallet...")
  const { wallet: treasuryWallet } = await client.fundWallet()
  console.log("✅ Treasury Wallet Created")
  console.log("   Address:", treasuryWallet.address)

  // ---- STEP 3: GENERATE MINTER WALLET ---------------------
  // Same process for the authorized minter wallet
  console.log("⏳ Generating Minter Wallet...")
  const { wallet: minterWallet } = await client.fundWallet()
  console.log("✅ Minter Wallet Created")
  console.log("   Address:", minterWallet.address)

  // ---- STEP 4: SAVE TO .env FILE --------------------------
  // Building the content string that gets written to .env
  // The ${} syntax inserts the actual wallet values into the string
  const envContent = `# CareChain NFT - Environment Variables
# NEVER share this file or commit it to GitHub

# XRPL Network
XRPL_NETWORK=wss://s.altnet.rippletest.net:51233

# Wallet Seeds (Testnet only until mainnet launch)
TREASURY_WALLET_SEED=${treasuryWallet.seed}
MINTER_WALLET_SEED=${minterWallet.seed}

# Wallet Addresses (public - safe to share)
TREASURY_WALLET_ADDRESS=${treasuryWallet.address}
MINTER_WALLET_ADDRESS=${minterWallet.address}

# Xaman API Credentials
XAMAN_API_KEY=your-xaman-api-key-here
XAMAN_API_SECRET=your-xaman-api-secret-here
`

  // Writes the content above directly into your .env file
  fs.writeFileSync(".env", envContent)
  console.log("✅ Seeds saved to .env file")

  // ---- STEP 5: DISPLAY SUMMARY ----------------------------
  // Shows public addresses only - seeds never displayed
  console.log("\n==========================================")
  console.log("        CARECHAIN WALLET SUMMARY         ")
  console.log("==========================================")
  console.log("TREASURY WALLET (Issuer)")
  console.log("Address:", treasuryWallet.address)
  console.log("------------------------------------------")
  console.log("MINTER WALLET (Authorized Minter)")
  console.log("Address:", minterWallet.address)
  console.log("==========================================")
  console.log("✅ Seeds saved securely to .env file")
  console.log("⚠️  Never share your .env file with anyone")
  console.log("==========================================\n")

  // ---- STEP 6: DISCONNECT ---------------------------------
  // Always close the connection cleanly when finished
  await client.disconnect()
  console.log("✅ Disconnected from XRPL Testnet")
}

// Runs the function and catches any errors cleanly
setupWallets().catch(console.error) 