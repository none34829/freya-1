import type { NextRequest } from "next/server";
import jwt from "jsonwebtoken";
import { getEnv } from "@/lib/env";
import { UnauthorizedError } from "@/lib/errors";
import type { AuthenticatedUser } from "@/lib/types";
import { SESSION_COOKIE_NAME } from "@/lib/constants";

interface SessionPayload {
  sub: string;
  name: string;
  role: AuthenticatedUser["role"];
  iat: number;
}

function getSecret(): string {
  return getEnv().SESSION_SECRET;
}

export function createSessionToken(user: AuthenticatedUser): string {
  return jwt.sign(
    {
      sub: user.id,
      name: user.name,
      role: user.role
    },
    getSecret(),
    { expiresIn: "12h" }
  );
}

export function parseSessionToken(token: string | undefined): AuthenticatedUser | null {
  if (!token) {
    return null;
  }

  try {
    const decoded = jwt.verify(token, getSecret()) as SessionPayload;
    return {
      id: decoded.sub,
      name: decoded.name,
      role: decoded.role
    };
  } catch {
    return null;
  }
}

export function requireUser(request: NextRequest): AuthenticatedUser {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const user = parseSessionToken(token);

  if (!user) {
    throw new UnauthorizedError();
  }

  return user;
}
