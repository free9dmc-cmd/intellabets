import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

const prisma = new PrismaClient()

const TIPSTERS = [
  {
    name: "Marcus 'SharpBet' Johnson",
    username: "sharpbet99",
    email: "marcus@example.com",
    bio: "10+ years betting sharp lines. NFL spread specialist. 63% career win rate across 1,200+ bets.",
    specialties: "NFL,NCAA",
    subscriptionPrice: 14.99,
    totalWins: 142,
    totalLosses: 83,
    totalPushes: 12,
    roi: 22.4,
    subscriberCount: 1240,
    isVerified: true,
    totalEarnings: 18765.2,
  },
  {
    name: "Courtney 'CourtVision' Kim",
    username: "courtvision_k",
    email: "courtney@example.com",
    bio: "Former college hoops player. NBA totals and props expert. Built a 61% win rate over 3 seasons.",
    specialties: "NBA,NCAA",
    subscriptionPrice: 12.99,
    totalWins: 218,
    totalLosses: 139,
    totalPushes: 8,
    roi: 18.2,
    subscriberCount: 980,
    isVerified: true,
    totalEarnings: 12380.6,
  },
  {
    name: "DiamondPicks MLB",
    username: "diamondpicks",
    email: "diamond@example.com",
    bio: "Baseball betting since 2015. Focus on run line and totals. Best in the business April-October.",
    specialties: "MLB",
    subscriptionPrice: 9.99,
    totalWins: 97,
    totalLosses: 66,
    totalPushes: 5,
    roi: 14.8,
    subscriberCount: 645,
    isVerified: false,
    totalEarnings: 5168.4,
  },
  {
    name: "TylerParlayKing",
    username: "parlayking_ty",
    email: "tyler@example.com",
    bio: "High-risk high-reward parlay builder. Not for the faint of heart. 54% but massive ROI.",
    specialties: "NFL,NBA,MLB",
    subscriptionPrice: 19.99,
    totalWins: 54,
    totalLosses: 46,
    totalPushes: 2,
    roi: 31.5,
    subscriberCount: 512,
    isVerified: false,
    totalEarnings: 8206.8,
  },
  {
    name: "Sofia 'Soccer Sharp' Martinez",
    username: "soccersharp_so",
    email: "sofia@example.com",
    bio: "European football specialist. Champions League and Premier League picks. Living in London.",
    specialties: "Soccer",
    subscriptionPrice: 11.99,
    totalWins: 88,
    totalLosses: 52,
    totalPushes: 7,
    roi: 16.9,
    subscriberCount: 430,
    isVerified: true,
    totalEarnings: 4123.5,
  },
  {
    name: "IcePickz_NHL",
    username: "icepickz",
    email: "icepickz@example.com",
    bio: "Hockey's best-kept secret. Puck line expert. Follow the ice, follow the money.",
    specialties: "NHL",
    subscriptionPrice: 7.99,
    totalWins: 65,
    totalLosses: 47,
    totalPushes: 9,
    roi: 12.3,
    subscriberCount: 280,
    isVerified: false,
    totalEarnings: 1793.6,
  },
  {
    name: "PropHunter_DK",
    username: "prophunter_dk",
    email: "prophunter@example.com",
    bio: "Player props specialist. Crush DK and FD with my daily prop sheets across NBA, NFL, MLB.",
    specialties: "NBA,NFL,MLB",
    subscriptionPrice: 24.99,
    totalWins: 189,
    totalLosses: 122,
    totalPushes: 18,
    roi: 20.1,
    subscriberCount: 892,
    isVerified: true,
    totalEarnings: 17820.0,
  },
  {
    name: "DesertPicks",
    username: "desertpicks",
    email: "desert@example.com",
    bio: "Las Vegas local. I watch line movement all day. When the books move — I follow.",
    specialties: "NFL,NBA",
    subscriptionPrice: 16.99,
    totalWins: 115,
    totalLosses: 78,
    totalPushes: 11,
    roi: 17.6,
    subscriberCount: 670,
    isVerified: false,
    totalEarnings: 9125.8,
  },
  {
    name: "UFC Edge Bettor",
    username: "ufcedge",
    email: "ufc@example.com",
    bio: "Trained MMA analyst. I watch every single fight card. 68% win rate on UFC moneylines.",
    specialties: "UFC",
    subscriptionPrice: 8.99,
    totalWins: 74,
    totalLosses: 35,
    totalPushes: 3,
    roi: 28.7,
    subscriberCount: 340,
    isVerified: false,
    totalEarnings: 2450.0,
  },
  {
    name: "AllSportsEdge",
    username: "allsportsedge",
    email: "allsports@example.com",
    bio: "Covers everything. Grinding value across all major sports since 2019. Consistency is key.",
    specialties: "NFL,NBA,MLB,NHL,Soccer",
    subscriptionPrice: 29.99,
    totalWins: 267,
    totalLosses: 198,
    totalPushes: 22,
    roi: 11.8,
    subscriberCount: 1580,
    isVerified: true,
    totalEarnings: 37864.0,
  },
]

const SAMPLE_BETS = [
  // NFL bets
  [
    { game: "Kansas City Chiefs @ Las Vegas Raiders", pick: "Chiefs -6.5", odds: -115, betType: "spread", sport: "NFL", homeTeam: "Las Vegas Raiders", awayTeam: "Kansas City Chiefs", line: "-6.5" },
    { game: "Dallas Cowboys @ Philadelphia Eagles", pick: "Eagles -3", odds: -110, betType: "spread", sport: "NFL", homeTeam: "Philadelphia Eagles", awayTeam: "Dallas Cowboys", line: "-3" },
  ],
  // NBA bets
  [
    { game: "LA Lakers @ Golden State Warriors", pick: "Over 224.5", odds: -110, betType: "total", sport: "NBA", homeTeam: "Golden State Warriors", awayTeam: "LA Lakers", line: "O 224.5" },
    { game: "Boston Celtics @ Miami Heat", pick: "Celtics -4.5", odds: -108, betType: "spread", sport: "NBA", homeTeam: "Miami Heat", awayTeam: "Boston Celtics", line: "-4.5" },
  ],
  // MLB bets
  [
    { game: "New York Yankees @ Boston Red Sox", pick: "Yankees ML", odds: -135, betType: "moneyline", sport: "MLB", homeTeam: "Boston Red Sox", awayTeam: "New York Yankees", line: "ML" },
  ],
  // Parlay
  [
    { game: "San Francisco 49ers @ Seattle Seahawks", pick: "49ers -3", odds: -112, betType: "parlay", sport: "NFL", homeTeam: "Seattle Seahawks", awayTeam: "San Francisco 49ers", line: "-3" },
    { game: "Denver Broncos @ Los Angeles Chargers", pick: "Under 44.5", odds: -108, betType: "parlay", sport: "NFL", homeTeam: "Los Angeles Chargers", awayTeam: "Denver Broncos", line: "U 44.5" },
    { game: "Chicago Bears @ Green Bay Packers", pick: "Packers -7", odds: -110, betType: "parlay", sport: "NFL", homeTeam: "Green Bay Packers", awayTeam: "Chicago Bears", line: "-7" },
  ],
]

function calcParlayOdds(oddsArr: number[]): number {
  const decimal = oddsArr.reduce((acc, o) => {
    const d = o > 0 ? o / 100 + 1 : 100 / Math.abs(o) + 1
    return acc * d
  }, 1)
  return decimal >= 2 ? Math.round((decimal - 1) * 100) : Math.round(-100 / (decimal - 1))
}

async function main() {
  console.log("🌱 Seeding database...")

  // Clean up existing data
  await prisma.bet.deleteMany()
  await prisma.betslip.deleteMany()
  await prisma.subscription.deleteMany()
  await prisma.aISubscription.deleteMany()
  await prisma.payout.deleteMany()
  await prisma.user.deleteMany()

  const hashedPassword = await bcrypt.hash("password123", 12)

  // Create a demo user for testing
  await prisma.user.create({
    data: {
      email: "demo@intellabets.com",
      username: "demouser",
      name: "Demo User",
      password: hashedPassword,
      image: `https://api.dicebear.com/7.x/avataaars/svg?seed=demouser`,
    },
  })

  // Create premium tipsters
  for (let i = 0; i < TIPSTERS.length; i++) {
    const t = TIPSTERS[i]
    const winRate = t.totalWins / (t.totalWins + t.totalLosses)

    const user = await prisma.user.create({
      data: {
        email: t.email,
        username: t.username,
        name: t.name,
        password: hashedPassword,
        bio: t.bio,
        specialties: t.specialties,
        subscriptionPrice: t.subscriptionPrice,
        isPremium: true,
        premiumSince: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
        premiumUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        totalWins: t.totalWins,
        totalLosses: t.totalLosses,
        totalPushes: t.totalPushes,
        winRate,
        roi: t.roi,
        subscriberCount: t.subscriberCount,
        totalEarnings: t.totalEarnings,
        isVerified: t.isVerified,
        image: `https://api.dicebear.com/7.x/avataaars/svg?seed=${t.username}`,
      },
    })

    // Create some betslips for each tipster
    const betGroupIdx = i % SAMPLE_BETS.length
    const betGroup = SAMPLE_BETS[betGroupIdx]
    const totalOdds = calcParlayOdds(betGroup.map((b) => b.odds))
    const stake = 100
    const totalDecimal = betGroup.reduce((acc, b) => {
      const d = b.odds > 0 ? b.odds / 100 + 1 : 100 / Math.abs(b.odds) + 1
      return acc * d
    }, 1)
    const potentialReturn = stake * totalDecimal

    // Won betslip
    await prisma.betslip.create({
      data: {
        userId: user.id,
        title: `${t.specialties.split(",")[0]} Value Play`,
        description: "Strong line value with sharp money on our side.",
        sport: t.specialties.split(",")[0],
        league: `${t.specialties.split(",")[0]} Regular Season`,
        totalOdds,
        stake,
        potentialReturn,
        status: "won",
        profitLoss: potentialReturn - stake,
        settledAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        bets: { create: betGroup.map((b) => ({ ...b, result: "won" })) },
      },
    })

    // Lost betslip
    await prisma.betslip.create({
      data: {
        userId: user.id,
        title: `${t.specialties.split(",")[0]} High Value Pick`,
        description: "Sharp angle on line movement.",
        sport: t.specialties.split(",")[0],
        league: `${t.specialties.split(",")[0]} Regular Season`,
        totalOdds: betGroup[0].odds,
        stake: 150,
        potentialReturn: 150 * (betGroup[0].odds > 0 ? betGroup[0].odds / 100 + 1 : 100 / Math.abs(betGroup[0].odds) + 1),
        status: "lost",
        profitLoss: -150,
        settledAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        bets: {
          create: [{
            ...betGroup[0],
            result: "lost",
          }],
        },
      },
    })

    // Pending betslip (public)
    await prisma.betslip.create({
      data: {
        userId: user.id,
        title: `Tonight's Best ${t.specialties.split(",")[0]} Plays`,
        description: "Premium picks for tonight. High confidence plays only.",
        sport: t.specialties.split(",")[0],
        league: `${t.specialties.split(",")[0]} Regular Season`,
        totalOdds,
        stake: 100,
        potentialReturn,
        status: "pending",
        profitLoss: 0,
        isPublic: true,
        bets: { create: betGroup },
      },
    })

    // Add a payout record for established tipsters
    if (t.totalEarnings > 1000) {
      const period = "2024-12"
      const amount = t.subscriptionPrice * Math.floor(t.subscriberCount * 0.1)
      const fee = amount * 0.2
      await prisma.payout.create({
        data: {
          userId: user.id,
          amount,
          fee,
          netAmount: amount - fee,
          period,
          status: "paid",
          paidAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
        },
      })
    }
  }

  const tipsters = await prisma.user.findMany({ where: { isPremium: true } })
  console.log(`✅ Created ${tipsters.length} premium tipsters`)

  const betslips = await prisma.betslip.count()
  console.log(`✅ Created ${betslips} betslips`)

  console.log("\n📧 Demo login credentials:")
  console.log("   Email:    demo@intellabets.com")
  console.log("   Password: password123")
  console.log("\n   Any tipster email (e.g. marcus@example.com) / password: password123")
  console.log("\n🚀 Seed complete!")
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
