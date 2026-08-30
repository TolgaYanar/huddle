// Prisma 7 no longer accepts `url = env("DATABASE_URL")` inside schema.prisma.
// The CLI (generate / migrate deploy / migrate dev) reads the connection URL
// from here instead; the runtime client gets it through the driver adapter in
// src/prisma.js. Both still read exactly DATABASE_URL, so deployment config is
// unchanged.
// Prisma 7 no longer auto-loads .env the way v6 did, so a local
// `npm run db:migrate` / `db:deploy` against apps/server/.env would fail with
// "The datasource.url property is required in your Prisma config file".
// Hosted environments (Railway) pass a real env var and are unaffected.
require("dotenv").config();

module.exports = {
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env.DATABASE_URL,
  },
};
