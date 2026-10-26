const Wallet = require("../models/wallets.models");
const asyncHandler = require("../helpers/asyncHandler");
const { ensureWallet, listTransactions, lookupAccount, transferFunds } = require("../services/wallet.service");
const { toPublicWallet, toPublicTransaction } = require("../helpers/present");

const createWallet = asyncHandler(async (req, res) => {
  const existing = await Wallet.findOne({ userId: req.user._id });
  const wallet = await ensureWallet(req.user._id);
  const created = !existing;

  return res.status(created ? 201 : 200).json({
    message: created ? "Wallet created successfully" : "Wallet already exists",
    wallet: toPublicWallet(wallet),
  });
});

const getWallet = asyncHandler(async (req, res) => {
  const wallet = await ensureWallet(req.user._id);
  return res.status(200).json({
    message: "Wallet fetched successfully",
    wallet: toPublicWallet(wallet),
  });
});

const getTransactions = asyncHandler(async (req, res) => {
  const { transactions, nextCursor } = await listTransactions(req.user._id, {
    limit: req.query.limit,
    cursor: req.query.cursor,
  });

  return res.status(200).json({
    transactions: transactions.map(toPublicTransaction),
    nextCursor,
  });
});

const lookupWallet = asyncHandler(async (req, res) => {
  const account = await lookupAccount(req.query.accountNumber);
  return res.status(200).json(account);
});

const transfer = asyncHandler(async (req, res) => {
  const result = await transferFunds(req.user._id, req.body);
  return res.status(200).json({
    replayed: result.replayed,
    amountKobo: result.amountKobo,
    accountNumber: result.accountNumber,
    recipientName: result.recipientName,
    wallet: toPublicWallet(result.wallet),
    message: result.replayed
      ? "This transfer was already sent."
      : `Sent to ${result.recipientName}.`,
  });
});

module.exports = { createWallet, getWallet, getTransactions, lookupWallet, transfer };
