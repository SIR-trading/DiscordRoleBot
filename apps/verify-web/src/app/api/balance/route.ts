import { NextResponse } from "next/server";
import { z } from "zod";
import { readBalancesForAddress } from "@/lib/balances";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AddressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/);

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const parsed = AddressSchema.safeParse(url.searchParams.get("address"));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid address." }, { status: 400 });
  }
  try {
    const payload = await readBalancesForAddress(parsed.data);
    return NextResponse.json(payload);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message || "Read failed." },
      { status: 502 },
    );
  }
}
