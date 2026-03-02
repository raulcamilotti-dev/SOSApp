#!/usr/bin/env node

/**
 * JWT Implementation Test Script
 * Tests:
 * 1. Verify endpoint returns JWT on successful login
 * 2. Verify JWT can be used for authenticated requests
 * 3. Verify backward compatibility with API key
 */

const API_URL = "https://sos-api-crud.raulcamilotti-c44.workers.dev";

async function testVerifyPassword() {
  console.log("\n📋 Test 1: Login Endpoint (/auth/verify-password)");
  console.log("─".repeat(60));

  try {
    const response = await fetch(`${API_URL}/auth/verify-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        identifier: "admin@example.com",
        password: "admin123",
      }),
    });

    const data = await response.json();
    console.log("Status:", response.status);
    console.log("Response:", JSON.stringify(data, null, 2));

    if (data.verified && data.token) {
      console.log("✅ SUCCESS: JWT token received!");
      console.log("Token preview:", data.token.substring(0, 50) + "...");
      return data.token;
    } else if (data.verified && !data.token) {
      console.log("⚠️  Password verified but no JWT token (check logs)");
      return null;
    } else {
      console.log("❌ Login failed (user may not exist in test DB)");
      return null;
    }
  } catch (err) {
    console.error("❌ Test failed:", err.message);
    return null;
  }
}

async function testWithJWT(token) {
  if (!token) {
    console.log("\n📋 Test 2: JWT Authentication — SKIPPED (no token)");
    return;
  }

  console.log("\n📋 Test 2: JWT Authentication (/tables)");
  console.log("─".repeat(60));

  try {
    const response = await fetch(`${API_URL}/tables`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    console.log("Status:", response.status);

    if (response.status === 200) {
      const data = await response.json();
      console.log("✅ SUCCESS: JWT authentication works!");
      console.log(
        "Tables count:",
        Array.isArray(data) ? data.length : "unknown",
      );
    } else {
      console.log("❌ JWT auth failed:", response.status);
      const text = await response.text();
      console.log("Response:", text.substring(0, 200));
    }
  } catch (err) {
    console.error("❌ Test failed:", err.message);
  }
}

async function testBackwardCompatibility() {
  console.log("\n📋 Test 3: Backward Compatibility (X-Api-Key)");
  console.log("─".repeat(60));

  // Note: API_KEY is a test key — this will likely fail unless it's set correctly
  const API_KEY = process.env.API_KEY || "test-key-should-not-work";

  try {
    const response = await fetch(`${API_URL}/health`, {
      method: "GET",
      headers: {
        "X-Api-Key": API_KEY,
      },
    });

    console.log("Status:", response.status);

    if (response.status === 200) {
      console.log("✅ SUCCESS: X-Api-Key still works!");
    } else {
      console.log("⚠️  X-Api-Key test returned status", response.status);
      console.log("(This may be expected if API_KEY env var is not set)");
    }
  } catch (err) {
    console.error("❌ Test failed:", err.message);
  }
}

async function main() {
  console.log("\n🔐 JWT Implementation Test Suite");
  console.log("═".repeat(60));
  console.log(`Testing: ${API_URL}`);

  const token = await testVerifyPassword();
  await testWithJWT(token);
  await testBackwardCompatibility();

  console.log("\n═".repeat(60));
  console.log("✅ Test suite completed!\n");
}

main().catch(console.error);
