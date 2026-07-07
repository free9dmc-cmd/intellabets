import { NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/prisma"

export async function POST(req: Request) {
  try {
    const { name, email, username, password } = await req.json()

    if (!name || !email || !username || !password) {
      return NextResponse.json({ error: "All fields are required" }, { status: 400 })
    }

    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 })
    }

    const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/
    if (!usernameRegex.test(username)) {
      return NextResponse.json(
        { error: "Username must be 3-20 characters, letters/numbers/underscores only" },
        { status: 400 }
      )
    }

    const existingEmail = await prisma.user.findUnique({ where: { email: email.toLowerCase() } })
    if (existingEmail) {
      return NextResponse.json({ error: "An account with that email already exists" }, { status: 409 })
    }

    const existingUsername = await prisma.user.findUnique({
      where: { username: username.toLowerCase() },
    })
    if (existingUsername) {
      return NextResponse.json({ error: "That username is already taken" }, { status: 409 })
    }

    const hashedPassword = await bcrypt.hash(password, 12)

    const user = await prisma.user.create({
      data: {
        name,
        email: email.toLowerCase(),
        username: username.toLowerCase(),
        password: hashedPassword,
        image: `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`,
      },
      select: { id: true, email: true, username: true, name: true },
    })

    return NextResponse.json({ user, message: "Account created successfully" }, { status: 201 })
  } catch (error) {
    console.error("Registration error:", error)
    return NextResponse.json({ error: "Failed to create account" }, { status: 500 })
  }
}
