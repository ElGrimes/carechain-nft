// ============================================================
// CareChain NFT - Institution Configuration Layer
// Purpose: Define and manage individual institution settings
// Each clinic or hospital gets their own configuration —
// custom tier names, custom benefits, custom pricing,
// and their own patient roster.
//
// KEY CONCEPT: CareChain is a PLATFORM. Every institution
// is a separate tenant with their own configuration.
// One CareChain back-end. Infinite institutional setups.
// This is what makes the platform scalable and acquirable.
//
// In production this data lives in a secure database.
// For now we're building the structure and logic that
// the database will eventually power.
// ============================================================

require("dotenv").config()
const fs = require("fs")
const path = require("path")

// ---- INSTITUTION CONFIGURATION STRUCTURE ----------------
// This is the template every institution follows.
// Each field is documented so any developer can understand
// exactly what it does without asking anyone.
//
// institutionID: unique identifier for this institution
// name: full legal name of the institution
// type: "private_practice", "clinic", "hospital", "government"
// location: city and state
// contact: primary contact person at the institution
// status: "pilot", "active", "suspended", "inactive"
// joinDate: when they joined the CareChain platform
// tiers: their custom tier configuration
// wallet: their designated wallet for receiving payments
// ============================================================

// ---- DEFAULT TIER TEMPLATE ------------------------------
// This is the base tier structure every institution starts with
// They can customize names, benefits, and pricing
// but the taxon numbers never change —
// 0 = Diamond, 1 = Gold, 2 = Silver across all institutions
function createDefaultTiers(customizations = {}) {
  return {
    diamond: {
      taxon: 0,
      name: customizations.diamond?.name || "Diamond",
      monthlyPrice: customizations.diamond?.monthlyPrice || 299,
      currency: "USD",
      benefits: customizations.diamond?.benefits || [
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
      maxMembers: customizations.diamond?.maxMembers || 50,
      activeMembers: 0
    },
    gold: {
      taxon: 1,
      name: customizations.gold?.name || "Gold",
      monthlyPrice: customizations.gold?.monthlyPrice || 149,
      currency: "USD",
      benefits: customizations.gold?.benefits || [
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
      maxMembers: customizations.gold?.maxMembers || 150,
      activeMembers: 0
    },
    silver: {
      taxon: 2,
      name: customizations.silver?.name || "Silver",
      monthlyPrice: customizations.silver?.monthlyPrice || 79,
      currency: "USD",
      benefits: customizations.silver?.benefits || [
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
      maxMembers: customizations.silver?.maxMembers || 300,
      activeMembers: 0
    }
  }
}

// ---- CREATE A NEW INSTITUTION ---------------------------
// This function creates a new institution configuration
// and saves it to a JSON file in the institutions folder.
// In production this writes to a secure database instead.
function createInstitution(institutionData) {

  // Validate required fields — every institution must have these
  const required = ["institutionID", "name", "type", "location", "contact"]
  const missing = required.filter(field => !institutionData[field])

  if (missing.length > 0) {
    console.error("❌ Missing required fields:", missing.join(", "))
    return null
  }

  // Build the complete institution object
  // Spread operator (...) merges the provided data with defaults
  const institution = {
    institutionID: institutionData.institutionID,
    name: institutionData.name,
    type: institutionData.type,
    location: institutionData.location,
    contact: institutionData.contact,
    status: institutionData.status || "pilot",
    joinDate: new Date().toISOString().split("T")[0],
    tiers: createDefaultTiers(institutionData.customTiers || {}),
    wallet: institutionData.wallet || null,
    patients: [],
    metrics: {
      totalMinted: 0,
      totalBurned: 0,
      totalReissued: 0,
      monthlyRevenue: 0,
      totalRevenue: 0
    },
    notes: institutionData.notes || ""
  }

  // Create institutions directory if it doesn't exist
  // This is where we store each institution's config file
  const institutionsDir = path.join(__dirname, "../../data/institutions")
  if (!fs.existsSync(institutionsDir)) {
    fs.mkdirSync(institutionsDir, { recursive: true })
  }

  // Save institution config to a JSON file
  // Each institution gets their own file named by their ID
  const filePath = path.join(
    institutionsDir,
    `${institution.institutionID}.json`
  )
  fs.writeFileSync(filePath, JSON.stringify(institution, null, 2))

  console.log("✅ Institution created:", institution.name)
  console.log("   ID:", institution.institutionID)
  console.log("   File:", filePath)

  return institution
}

// ---- LOAD AN INSTITUTION --------------------------------
// Load an existing institution configuration by ID
function loadInstitution(institutionID) {
  const filePath = path.join(
    __dirname,
    `../../data/institutions/${institutionID}.json`
  )

  if (!fs.existsSync(filePath)) {
    console.error("❌ Institution not found:", institutionID)
    return null
  }

  const institution = JSON.parse(fs.readFileSync(filePath, "utf8"))
  console.log("✅ Institution loaded:", institution.name)
  return institution
}

// ---- UPDATE INSTITUTION METRICS -------------------------
// Called after every mint, burn, or reissue to keep
// the institution's metrics current and accurate.
// This is the data that feeds your investor dashboard.
function updateMetrics(institutionID, action, tier, amount = 0) {
  const institution = loadInstitution(institutionID)
  if (!institution) return null

  // Update metrics based on the action taken
  // action: "mint", "burn", or "reissue"
  switch(action) {
    case "mint":
      institution.metrics.totalMinted++
      institution.tiers[tier].activeMembers++
      institution.metrics.monthlyRevenue += amount
      institution.metrics.totalRevenue += amount
      break
    case "burn":
      institution.metrics.totalBurned++
      institution.tiers[tier].activeMembers--
      institution.metrics.monthlyRevenue -= amount
      break
    case "reissue":
      institution.metrics.totalReissued++
      institution.metrics.monthlyRevenue += amount
      institution.metrics.totalRevenue += amount
      break
  }

  // Save updated metrics back to the file
  const filePath = path.join(
    __dirname,
    `../../data/institutions/${institutionID}.json`
  )
  fs.writeFileSync(filePath, JSON.stringify(institution, null, 2))

  console.log("✅ Metrics updated for:", institution.name)
  return institution
}

// ---- ADD PATIENT TO INSTITUTION -------------------------
// Records a patient enrollment in the institution config
// patientData contains wallet address, tier, and enroll date
function addPatient(institutionID, patientData) {
  const institution = loadInstitution(institutionID)
  if (!institution) return null

  // Check if patient already exists in this institution
  const existing = institution.patients
    .find(p => p.walletAddress === patientData.walletAddress)

  if (existing) {
    console.error("❌ Patient already enrolled in this institution")
    return null
  }

  // Build patient record — no PHI stored here
  // Only blockchain-relevant data
  const patient = {
    walletAddress: patientData.walletAddress,
    tier: patientData.tier,
    nftokenID: patientData.nftokenID,
    enrollDate: new Date().toISOString().split("T")[0],
    nextRenewal: patientData.nextRenewal,
    status: "active"
  }

  institution.patients.push(patient)

  // Save updated institution config
  const filePath = path.join(
    __dirname,
    `../../data/institutions/${institutionID}.json`
  )
  fs.writeFileSync(filePath, JSON.stringify(institution, null, 2))

  console.log("✅ Patient added to:", institution.name)
  console.log("   Wallet:", patientData.walletAddress)
  console.log("   Tier:", patientData.tier)

  return patient
}

// ---- DISPLAY INSTITUTION SUMMARY ------------------------
// Prints a clean summary of an institution's current status
// This is what you see in the admin dashboard
function displayInstitutionSummary(institutionID) {
  const institution = loadInstitution(institutionID)
  if (!institution) return

  console.log("\n==========================================")
  console.log("       INSTITUTION SUMMARY               ")
  console.log("==========================================")
  console.log("Name:", institution.name)
  console.log("ID:", institution.institutionID)
  console.log("Type:", institution.type)
  console.log("Location:", institution.location)
  console.log("Status:", institution.status.toUpperCase())
  console.log("Join Date:", institution.joinDate)
  console.log("------------------------------------------")
  console.log("MEMBERSHIP TIERS")
  console.log("------------------------------------------")
  Object.entries(institution.tiers).forEach(([key, tier]) => {
    console.log(`${tier.name} Tier:`)
    console.log(`   Monthly Price: $${tier.monthlyPrice}`)
    console.log(`   Active Members: ${tier.activeMembers}/${tier.maxMembers}`)
  })
  console.log("------------------------------------------")
  console.log("METRICS")
  console.log("------------------------------------------")
  console.log("Total Minted:", institution.metrics.totalMinted)
  console.log("Total Burned:", institution.metrics.totalBurned)
  console.log("Total Reissued:", institution.metrics.totalReissued)
  console.log("Monthly Revenue: $" + institution.metrics.monthlyRevenue)
  console.log("Total Revenue: $" + institution.metrics.totalRevenue)
  console.log("Active Patients:", institution.patients.length)
  console.log("==========================================\n")
}

// ---- CREATE PILOT INSTITUTION ---------------------------
// This creates your first pilot clinic configuration
// Replace the values below with your actual pilot clinic
// details when you have them confirmed
const pilotClinic = createInstitution({
  institutionID: "PILOT_001",
  name: "CareChain Pilot Clinic",
  type: "private_practice",
  location: "Houston, TX",
  contact: {
    name: "Clinic Administrator",
    email: "admin@pilotclinic.com",
    phone: "555-000-0000"
  },
  status: "pilot",
  notes: "First CareChain pilot program institution",

  // Custom tier configuration for this clinic
  // They can set their own prices and member limits
  customTiers: {
    diamond: {
      monthlyPrice: 399,
      maxMembers: 25
    },
    gold: {
      monthlyPrice: 199,
      maxMembers: 75
    },
    silver: {
      monthlyPrice: 99,
      maxMembers: 200
    }
  }
})

// Display the summary if institution was created successfully
if (pilotClinic) {
  displayInstitutionSummary("PILOT_001")
}

// Export functions so other scripts can use them
module.exports = {
  createInstitution,
  loadInstitution,
  updateMetrics,
  addPatient,
  displayInstitutionSummary,
  createDefaultTiers
}