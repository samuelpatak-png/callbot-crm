import { NextResponse } from "next/server";

export async function POST() {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="sk-SK" voice="Polly.Mia">CallBot CRM. Pripojenie na ChatGPT Live sa pripravuje. Ďakujeme za hovor.</Say>
  <Pause length="1"/>
  <Hangup/>
</Response>`;
  return new NextResponse(xml, {
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

export async function GET() {
  return POST();
}
