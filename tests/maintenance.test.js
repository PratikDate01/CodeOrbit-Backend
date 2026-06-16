/* global describe, it, beforeAll, afterAll, expect */
const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../index");
const SystemSetting = require("../models/SystemSetting");
const User = require("../models/User");
const jwt = require("jsonwebtoken");
const connectDB = require("../config/db");

jest.setTimeout(30000);

describe("Maintenance Mode System", () => {
  let originalSetting;
  let adminToken;
  let clientToken;
  let whitelistedToken;
  let adminUser;
  let clientUser;
  let whitelistedUser;

  beforeAll(async () => {
    // Establish DB connection first
    await connectDB();
    
    // Save original setting if it exists
    originalSetting = await SystemSetting.findOne({ key: "maintenance_config" });

    // Create or find users for token generation
    adminUser = await User.findOne({ email: "testadmin@codeorbit.com" });
    if (!adminUser) {
      adminUser = await User.create({
        name: "Test Admin",
        email: "testadmin@codeorbit.com",
        password: "password123",
        role: "admin"
      });
    }

    clientUser = await User.findOne({ email: "testclient@codeorbit.com" });
    if (!clientUser) {
      clientUser = await User.create({
        name: "Test Client",
        email: "testclient@codeorbit.com",
        password: "password123",
        role: "client"
      });
    }

    whitelistedUser = await User.findOne({ email: "whitelisted@codeorbit.com" });
    if (!whitelistedUser) {
      whitelistedUser = await User.create({
        name: "Whitelisted Tester",
        email: "whitelisted@codeorbit.com",
        password: "password123",
        role: "client"
      });
    }

    // Generate tokens
    adminToken = jwt.sign({ id: adminUser._id }, process.env.JWT_SECRET, { expiresIn: "1h" });
    clientToken = jwt.sign({ id: clientUser._id }, process.env.JWT_SECRET, { expiresIn: "1h" });
    whitelistedToken = jwt.sign({ id: whitelistedUser._id }, process.env.JWT_SECRET, { expiresIn: "1h" });
  });

  afterAll(async () => {
    // Restore original setting
    if (originalSetting) {
      await SystemSetting.findOneAndUpdate(
        { key: "maintenance_config" },
        {
          maintenanceMode: originalSetting.maintenanceMode,
          allowedUsers: originalSetting.allowedUsers,
          enabledBy: originalSetting.enabledBy,
          enabledAt: originalSetting.enabledAt
        },
        { upsert: true }
      );
    } else {
      await SystemSetting.deleteOne({ key: "maintenance_config" });
    }

    // Clean up test users
    await User.deleteOne({ email: "testadmin@codeorbit.com" });
    await User.deleteOne({ email: "testclient@codeorbit.com" });
    await User.deleteOne({ email: "whitelisted@codeorbit.com" });

    await mongoose.connection.close();
  });

  it("should respond normally when maintenance mode is OFF", async () => {
    const res = await request(app)
      .put("/api/admin/system/maintenance")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ maintenanceMode: false, allowedUsers: [] });
    
    expect(res.statusCode).toEqual(200);
    expect(res.body.maintenanceMode).toEqual(false);

    // Now test a public route
    const pingRes = await request(app).get("/api/ping");
    expect(pingRes.statusCode).toEqual(200);

    // Test a profile route for client returns 200 (authenticated)
    const profileRes = await request(app)
      .get("/api/auth/profile")
      .set("Authorization", `Bearer ${clientToken}`);
    expect(profileRes.statusCode).toEqual(200);
  });

  it("should block public users and normal clients when maintenance is ON", async () => {
    // Enable maintenance mode via admin PUT endpoint so the cache updates
    const putRes = await request(app)
      .put("/api/admin/system/maintenance")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ maintenanceMode: true, allowedUsers: ["whitelisted@codeorbit.com"] });
      
    expect(putRes.statusCode).toEqual(200);
    expect(putRes.body.maintenanceMode).toEqual(true);

    // 1. Public home route `/` should return 503
    const homeRes = await request(app).get("/");
    expect(homeRes.statusCode).toEqual(503);
    expect(homeRes.body.message).toEqual("System under maintenance");

    // 2. Exempt route `/api/ping` should return 200
    const pingRes = await request(app).get("/api/ping");
    expect(pingRes.statusCode).toEqual(200);

    // 3. Exempt route `/api/maintenance/status` should return 200
    const statusRes = await request(app).get("/api/maintenance/status");
    expect(statusRes.statusCode).toEqual(200);
    expect(statusRes.body.maintenanceMode).toEqual(true);

    // 4. Normal client should be blocked (503)
    const clientRes = await request(app)
      .get("/api/auth/profile")
      .set("Authorization", `Bearer ${clientToken}`);
    expect(clientRes.statusCode).toEqual(503);
    expect(clientRes.body.message).toEqual("System under maintenance");
  });

  it("should allow Admin and Whitelisted test users to bypass maintenance", async () => {
    // 1. Admin bypass
    const adminRes = await request(app)
      .get("/api/auth/profile")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(adminRes.statusCode).toEqual(200);

    // 2. Whitelisted client bypass
    const whitelistedRes = await request(app)
      .get("/api/auth/profile")
      .set("Authorization", `Bearer ${whitelistedToken}`);
    expect(whitelistedRes.statusCode).toEqual(200);
  });
});
