const Wallet = require("../models/wallets.models");
const User = require("../models/user.models");
const TransactionHistory = require("../models/transactionHistory");
const AppError = require("../helpers/appError");
const { isDuplicateKey } = require("../helpers/mongoError");
const withDbTransaction = require("../helpers/withTransaction");
const { MIN_TRANSFER_KOBO, MAX_CHARGE_KOBO } = require("../helpers/money");

function accountNumberFromPhone(phone) {
  const digits = String(phone || "").trim();
  if (!digits) {
    throw new AppError("Add a phone number before opening a wallet.", 400, "phone_required");
  }

  const accountNumber = digits.replace(/^0/, "");
  if (!/^\d{10}$/.test(accountNumber)) {
    throw new AppError(
      "A phone number needs a leading 0 and 11 digits to open a wallet.",
      400,
      "invalid_phone",
    );
  }

  return accountNumber;
}

async function ensureWallet(userId) {
  const user = await User.findById(userId).select("phone");
  if (!user) throw new AppError("User not found.", 404, "user_missing");

  const accountNumber = accountNumberFromPhone(user.phone);
  const existing = await Wallet.findOne({ userId });

  if (existing) {
    if (existing.accountNumber === accountNumber) return existing;
    existing.accountNumber = accountNumber;
    try {
      await existing.save();
      return existing;
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
      throw new AppError("This phone number is already used for a wallet.", 409, "account_taken");
    }
  }

  try {
    return await Wallet.create({
      userId,
      accountNumber,
      balanceKobo: 0,
      currency: "NGN",
      status: "active",
    });
  } catch (error) {
    if (!isDuplicateKey(error)) throw error;
    const winner = await Wallet.findOne({ userId });
    if (winner) return winner;
    throw new AppError("This phone number is already used for a wallet.", 409, "account_taken");
  }
}

async function listTransactions(userId, { limit = 20, cursor } = {}) {
  const filter = { userId };
  if (cursor) filter._id = { $lt: cursor };

  const rows = await TransactionHistory.find(filter).sort({ _id: -1 }).limit(limit + 1);
  const hasMore = rows.length > limit;
  const transactions = hasMore ? rows.slice(0, limit) : rows;
  const last = transactions[transactions.length - 1];

  return {
    transactions,
    nextCursor: hasMore && last ? String(last._id) : null,
  };
}

// The only place a purse balance is allowed to change.
async function applyBalanceChange(session, {
  userId,
  amountKobo,
  direction,
  reference,
  provider,
  purpose,
  description,
  paymentId = null,
  orderId = null,
  requireActive = false,
}) {
  if (!Number.isInteger(amountKobo) || amountKobo <= 0) {
    throw new AppError("Amount is not valid.", 400, "invalid_amount");
  }

  const already = await TransactionHistory.findOne({ reference }).session(session);
  if (already) {
    const wallet = await Wallet.findOne({ userId }).session(session);
    return { wallet, entry: already, duplicate: true };
  }

  const filter = { userId };
  const delta = direction === "credit" ? amountKobo : -amountKobo;
  if (direction === "debit" || requireActive) {
    filter.status = "active";
  }
  if (direction === "debit") {
    filter.balanceKobo = { $gte: amountKobo };
  }

  const wallet = await Wallet.findOneAndUpdate(
    filter,
    { $inc: { balanceKobo: delta } },
    { returnDocument: "after", session },
  );

  if (!wallet) {
    const exists = await Wallet.findOne({ userId }).session(session);
    if (!exists) throw new AppError("Wallet not found.", 404, "wallet_missing");
    if (exists.status !== "active") {
      throw new AppError("This wallet is frozen.", 403, "wallet_frozen");
    }
    throw new AppError("Your wallet does not have enough money.", 400, "insufficient_funds");
  }

  if (!Number.isInteger(wallet.balanceKobo)) {
    throw new AppError("Wallet balance became invalid.", 500);
  }

  const balanceAfterKobo = wallet.balanceKobo;
  const balanceBeforeKobo = balanceAfterKobo - delta;

  const [entry] = await TransactionHistory.create(
    [
      {
        userId,
        walletId: wallet._id,
        paymentId,
        orderId,
        reference,
        provider,
        type: direction,
        purpose,
        amountKobo,
        balanceBeforeKobo,
        balanceAfterKobo,
        currency: "NGN",
        status: "completed",
        description,
      },
    ],
    { session },
  );

  return { wallet, entry, duplicate: false };
}

function displayName(user) {
  const name = `${user?.firstName || ""} ${user?.lastName || ""}`.replace(/\s+/g, " ").trim();
  return name || "Aether member";
}

function normalizeAccountNumber(accountNumber) {
  const digits = String(accountNumber || "").replace(/\D/g, "");
  if (!/^\d{10}$/.test(digits)) {
    throw new AppError("Enter the 10-digit account number.", 400, "invalid_account");
  }
  return digits;
}

async function findRecipient(accountNumber) {
  const digits = normalizeAccountNumber(accountNumber);
  const wallet = await Wallet.findOne({ accountNumber: digits });
  const user = wallet
    ? await User.findById(wallet.userId).select("firstName lastName phone")
    : await User.findOne({ $or: [{ phone: digits }, { phone: `0${digits}` }] }).select("firstName lastName phone");

  if (!user) {
    throw new AppError("No wallet uses that account number.", 404, "account_unknown");
  }

  return {
    accountNumber: digits,
    userId: user._id,
    name: displayName(user),
    wallet,
  };
}

async function lookupAccount(accountNumber) {
  const recipient = await findRecipient(accountNumber);
  return {
    accountNumber: recipient.accountNumber,
    name: recipient.name,
  };
}

function transferReferences(userId, idempotencyKey) {
  const base = `tj_xfer_${userId}_${idempotencyKey}`;
  return { debit: `${base}_out`, credit: `${base}_in` };
}

async function transferFunds(fromUserId, { accountNumber, amountKobo, idempotencyKey }) {
  if (!Number.isInteger(amountKobo) || amountKobo < MIN_TRANSFER_KOBO || amountKobo > MAX_CHARGE_KOBO) {
    throw new AppError("Send between ₦1 and ₦5,000,000.", 400, "invalid_amount");
  }
  if (!idempotencyKey || String(idempotencyKey).length < 8) {
    throw new AppError("This transfer needs a new attempt key.", 400, "invalid_key");
  }

  const recipient = await findRecipient(accountNumber);
  const sender = await ensureWallet(fromUserId);
  if (sender.status !== "active") {
    throw new AppError("This wallet is frozen.", 403, "wallet_frozen");
  }
  if (String(recipient.userId) === String(fromUserId) || recipient.accountNumber === sender.accountNumber) {
    throw new AppError("You cannot send money to yourself.", 400, "same_wallet");
  }

  const recipientWallet = recipient.wallet || await ensureWallet(recipient.userId);
  if (recipientWallet.status !== "active") {
    throw new AppError("That wallet cannot receive money right now.", 403, "recipient_frozen");
  }

  const refs = transferReferences(fromUserId, idempotencyKey);
  const already = await TransactionHistory.findOne({ reference: refs.debit });
  if (already) {
    const wallet = await Wallet.findOne({ userId: fromUserId });
    return {
      wallet,
      amountKobo,
      accountNumber: recipient.accountNumber,
      recipientName: recipient.name,
      replayed: true,
    };
  }

  const senderUser = await User.findById(fromUserId).select("firstName lastName");
  const sent = `Sent to ${recipient.name} · ${recipient.accountNumber}`.slice(0, 200);
  const received = `Received from ${displayName(senderUser)} · ${sender.accountNumber}`.slice(0, 200);

  return withDbTransaction(async (session) => {
    const again = await TransactionHistory.findOne({ reference: refs.debit }).session(session);
    if (again) {
      const wallet = await Wallet.findOne({ userId: fromUserId }).session(session);
      return {
        wallet,
        amountKobo,
        accountNumber: recipient.accountNumber,
        recipientName: recipient.name,
        replayed: true,
      };
    }

    const { wallet } = await applyBalanceChange(session, {
      userId: fromUserId,
      amountKobo,
      direction: "debit",
      reference: refs.debit,
      provider: "wallet",
      purpose: "transfer",
      description: sent,
      requireActive: true,
    });
    await applyBalanceChange(session, {
      userId: recipient.userId,
      amountKobo,
      direction: "credit",
      reference: refs.credit,
      provider: "wallet",
      purpose: "transfer",
      description: received,
      requireActive: true,
    });

    return {
      wallet,
      amountKobo,
      accountNumber: recipient.accountNumber,
      recipientName: recipient.name,
      replayed: false,
    };
  });
}

module.exports = {
  ensureWallet,
  listTransactions,
  applyBalanceChange,
  lookupAccount,
  transferFunds,
};
