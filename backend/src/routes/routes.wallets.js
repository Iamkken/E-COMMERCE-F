const express = require("express");
const router = express.Router();
const { requireAuth } = require("../middlewares/auth");
const validate = require("../middlewares/validate");
const rateLimit = require("../middlewares/rateLimit");
const { listTransactionsSchema, lookupAccountSchema, transferSchema } = require("../validators/wallet.validators");
const {
  createWallet,
  getWallet,
  getTransactions,
  lookupWallet,
  transfer,
} = require("../controllers/wallet.controller");

const transferLimit = rateLimit({ windowMs: 60_000, max: 10 });

router.get(
  "/lookup",
  requireAuth,
  rateLimit({ windowMs: 60_000, max: 30 }),
  validate(lookupAccountSchema, "query"),
  lookupWallet,
);
router.post("/transfer", requireAuth, transferLimit, validate(transferSchema), transfer);
router.post("/", requireAuth, createWallet);
router.post("/create-wallet", requireAuth, createWallet);
router.get("/", requireAuth, getWallet);
router.get("/get-wallet", requireAuth, getWallet);
router.get(
  "/transactions",
  requireAuth,
  validate(listTransactionsSchema, "query"),
  getTransactions,
);

module.exports = router;
