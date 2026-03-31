// ============================================================
// CareChain NFT - Membership Verification Script
// Purpose: Verify a patient's membership status at point
// of care. This is what powers the front desk check-in.
//
// FLOW:
// 1. Patient presents Xaman wallet QR code
// 2. Staff scans QR code — gets patient wallet address
// 3. This script checks the XRPL for active membership NFT
// 4. Returns tier and benefits instantly
//
// KEY CONCEPT: The blockchain IS the database. We don't
// need to check an internal database — we check the ledger
// directly. This means verification works anywhere in the
// world, at any institution, instantly.
// ============================================================

require("dotenv").config()
const xrpl = require("../../node_modules/xrpl")

// ---- TIER DEFINITIONS -----------------------------------
// This maps each taxon number back to a tier name
// and defines the benefits for each tier.
// In production these benefits will be pulled from
// the institution configuration layer we build next.
const TIER_DEFINITIONS = {
  0: {
    name: "Diamond",
    taxon: 0,
    benefits: [
      "Significant discounts on all healthcare services",
      "Priority access to specialty care",
      "Exclusive wellness programs and home visits",
      "VIP treatment and concierge amenities",
      "Dedicated care coordinator",
      "Exclusive events and healthcare seminars",
      "Complimentary health screenings",
      "Customized rewards and incentives",
      "Access to cutting-edge healthcare technologies"
    ],
    color: "💎"
  },
  1: {
    name: "Gold",
    taxon: 1,
    benefits: [
      "Significant discounts on healthcare services",
      "Priority access to healthcare providers",
      "Access to specialty care services",
      "Wellness resources and programs",
      "Exclusive events and workshops",
      "Personalized health recommendations",
      "Complimentary health screenings",
      "Rewards and incentives for engagement",
      "Access to digital health tools"
    ],
    color: "🥇"
  },
  2: {
    name: "Silver",
    taxon: 2,
    benefits: [
      "Discounts on basic healthcare services",
      "Access to educational health resources",
      "Wellness tips and recommendations",
      "Special offers and promotions",
      "Incentives for participation",
      "Community engagement opportunities",
      "Access to basic health screenings",
      "Preventative care support",
      "Customer support and assistance"
    ],
    color: "🥈"
  }
}

async function verifyMembership(patientWalletAddress) {

  // ---- STEP 1: VALIDATE INPUT ---------------------------
  // Confirm a wallet address was provided
  if (!patientWalletAddress) {
    console.error("❌ Patient wallet address is required")
    return
  }

  console.log("\n⏳ Verifying membership...")
  console.log("   Patient Wallet:", patientWalletAddress)

  // ---- STEP 2: CONNECT TO TESTNET -----------------------
  const client = new xrpl.Client("wss://s.altnet.rippletest.net:51233")
  await client.connect()
  console.log("✅ Connected to XRPL Testnet")

  // ---- STEP 3: LOAD TREASURY WALLET ADDRESS ------------
  // We need the treasury wallet address to verify that
  // the NFT was issued by CareChain and not by someone
  // else. This prevents fake NFTs from being presented.
  // We only check the address — not the seed.
  // The seed never leaves the .env file.
  const treasuryAddress = process.env.TREASURY_WALLET_ADDRESS

  // ---- STEP 4: CHECK PATIENT WALLET FOR NFTS -----------
  // We query the XRPL directly for all NFTs on this wallet
  // account_nfts returns every NFT the wallet currently holds
  console.log("\n⏳ Checking wallet for CareChain membership NFT...")

  let patientNFTs
  try {
    patientNFTs = await client.request({
      command: "account_nfts",
      account: patientWalletAddress
    })
  } catch (error) {
    // If the account doesn't exist on the ledger at all
    // the request will throw an error — we catch it here
    console.error("❌ Wallet not found on XRPL")
    console.error("   This wallet may not exist or has no activity")
    await client.disconnect()
    return {
      verified: false,
      reason: "Wallet not found on XRPL"
    }
  }

  // ---- STEP 5: FIND CARECHAIN NFT ----------------------
  // We search through all NFTs on the wallet looking for
  // one that was issued by our treasury wallet.
  // Issuer field must match our treasury address exactly.
  // This is the authenticity check — only CareChain issued
  // NFTs will have our treasury address as the issuer.
  const careChainNFT = patientNFTs.result.account_nfts
    .find(nft => nft.Issuer === treasuryAddress)

  // ---- STEP 6: HANDLE NO MEMBERSHIP FOUND -------------
  // If no CareChain NFT is found the patient either:
  // - Has never had a membership
  // - Their membership expired and was burned
  // - They cancelled their membership
  if (!careChainNFT) {
    console.log("\n==========================================")
    console.log("         CARECHAIN VERIFICATION RESULT   ")
    console.log("==========================================")
    console.log("STATUS: ❌ NO ACTIVE MEMBERSHIP FOUND")
    console.log("------------------------------------------")
    console.log("Patient Wallet:", patientWalletAddress)
    console.log("------------------------------------------")
    console.log("This patient does not have an active")
    console.log("CareChain NFT membership.")
    console.log("Please direct them to the enrollment desk.")
    console.log("==========================================\n")

    await client.disconnect()
    return {
      verified: false,
      reason: "No active CareChain membership found"
    }
  }

  // ---- STEP 7: IDENTIFY TIER ---------------------------
  // We found a CareChain NFT. Now we identify which tier
  // it is by checking the NFTokenTaxon field.
  // Taxon 0 = Diamond, 1 = Gold, 2 = Silver
  const tierInfo = TIER_DEFINITIONS[careChainNFT.NFTokenTaxon]

  if (!tierInfo) {
    console.error("❌ Unknown tier taxon:", careChainNFT.NFTokenTaxon)
    await client.disconnect()
    return {
      verified: false,
      reason: "Unknown membership tier"
    }
  }

  // ---- STEP 8: DECODE URI ------------------------------
  // The URI field is stored as hex on the ledger.
  // We convert it back to a readable string so staff
  // can see where the metadata lives if needed.
  let decodedURI = "No URI"
  if (careChainNFT.URI) {
    decodedURI = xrpl.convertHexToString(careChainNFT.URI)
  }

  // ---- STEP 9: DISPLAY VERIFICATION RESULT ------------
  // This is what the front desk staff sees on their screen.
  // Clean, clear, actionable. Green means they're good to go.
  console.log("\n==========================================")
  console.log("         CARECHAIN VERIFICATION RESULT   ")
  console.log("==========================================")
  console.log(`STATUS: ✅ ACTIVE MEMBERSHIP CONFIRMED`)
  console.log("------------------------------------------")
  console.log(`TIER: ${tierInfo.color} ${tierInfo.name.toUpperCase()}`)
  console.log("------------------------------------------")
  console.log("Patient Wallet:", patientWalletAddress)
  console.log("NFTokenID:", careChainNFT.NFTokenID)
  console.log("Issued By:", careChainNFT.Issuer)
  console.log("Metadata:", decodedURI)
  console.log("------------------------------------------")
  console.log("BENEFITS FOR THIS VISIT:")
  tierInfo.benefits.forEach((benefit, index) => {
    console.log(`   ${index + 1}. ${benefit}`)
  })
  console.log("==========================================\n")

  // ---- STEP 10: DISCONNECT ----------------------------
  await client.disconnect()
  console.log("✅ Disconnected from XRPL Testnet")

  // Return full verification result for the portal UI
  return {
    verified: true,
    tier: tierInfo.name,
    nftokenID: careChainNFT.NFTokenID,
    patientWallet: patientWalletAddress,
    benefits: tierInfo.benefits,
    issuer: careChainNFT.Issuer,
    uri: decodedURI
  }
}

// ---- TEST THE VERIFICATION SCRIPT --------------------
// We're checking the treasury wallet since that's where
// we sent the test NFT in the reissue script
const testPatientWallet = process.env.MINTER_WALLET_ADDRESS

verifyMembership(testPatientWallet)