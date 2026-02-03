const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../index");

describe("Backend Health Checks", () => {
  // Close DB connection after tests to prevent Jest from hanging
  afterAll(async () => {
    await mongoose.connection.close();
  });

  it("should return pong from /api/ping", async () => {
    const res = await request(app).get("/api/ping");
    expect(res.statusCode).toEqual(200);
    expect(res.text).toEqual("pong");
  });

  it("should return Backend is running from /", async () => {
    const res = await request(app).get("/");
    expect(res.statusCode).toEqual(200);
    expect(res.text).toEqual("Backend is running");
  });

  it("should return 404 for non-existent routes", async () => {
    const res = await request(app).get("/api/non-existent-route");
    expect(res.statusCode).toEqual(404);
    expect(res.body).toHaveProperty("message");
  });

  it("should return 401 for protected routes without token", async () => {
    const res = await request(app).get("/api/internships/my-applications");
    expect(res.statusCode).toEqual(401);
  });
});
