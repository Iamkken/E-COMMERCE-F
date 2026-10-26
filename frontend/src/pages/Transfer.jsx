import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, formatPrice, nairaToKobo } from "../api";
import { getToken } from "../auth";
import { useApp } from "../store";

const MIN_TRANSFER_KOBO = 100;

export default function Transfer() {
  const { user, toast } = useApp();
  const [wallet, setWallet] = useState(null);
  const [loading, setLoading] = useState(true);
  const [accountNumber, setAccountNumber] = useState("");
  const [recipient, setRecipient] = useState(null);
  const [lookupError, setLookupError] = useState("");
  const [naira, setNaira] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(null);
  const payKey = useRef("");

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    let ignore = false;
    api("/api/v1/wallets", { token: getToken() })
      .then((data) => {
        if (!ignore) setWallet(data.wallet);
      })
      .catch((error) => {
        if (!ignore) toast(error.message, "error");
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [user, toast]);

  useEffect(() => {
    const digits = accountNumber.replace(/\D/g, "");
    if (digits.length !== 10) {
      setRecipient(null);
      setLookupError("");
      return;
    }
    if (wallet && digits === wallet.accountNumber) {
      setRecipient(null);
      setLookupError("That is your own account number.");
      return;
    }

    setRecipient(null);
    setLookupError("");
    let ignore = false;
    const timer = setTimeout(() => {
      api(`/api/v1/wallets/lookup?accountNumber=${digits}`, { token: getToken() })
        .then((data) => {
          if (ignore) return;
          setRecipient(data);
          setLookupError("");
        })
        .catch((error) => {
          if (ignore) return;
          setRecipient(null);
          setLookupError(error.message);
        });
    }, 250);

    return () => {
      ignore = true;
      clearTimeout(timer);
    };
  }, [accountNumber, wallet]);

  if (!user && getToken()) {
    return (
      <section className="panel glass page">
        <p className="muted">Opening your wallet…</p>
      </section>
    );
  }

  if (!user) {
    return (
      <section className="panel glass page">
        <p className="eyebrow mono">Wallet</p>
        <h1 className="title">Sign in to send money.</h1>
        <p className="muted">Transfers move naira from your wallet to another account number.</p>
        <Link className="button" to="/login?next=/wallet/transfer">
          Sign in
        </Link>
      </section>
    );
  }

  const send = async (event) => {
    event.preventDefault();
    const digits = accountNumber.replace(/\D/g, "");
    const amountKobo = nairaToKobo(naira);
    if (!recipient || digits.length !== 10) {
      toast(lookupError || "Enter a 10-digit account number.", "error");
      return;
    }
    if (!Number.isInteger(amountKobo) || amountKobo < MIN_TRANSFER_KOBO) {
      toast("The smallest transfer is ₦1.", "error");
      return;
    }
    if (wallet && amountKobo > wallet.balanceKobo) {
      toast("Your wallet does not have enough money.", "error");
      return;
    }
    if (!payKey.current) payKey.current = crypto.randomUUID();
    setSending(true);
    try {
      const data = await api("/api/v1/wallets/transfer", {
        method: "POST",
        token: getToken(),
        body: {
          accountNumber: digits,
          amountKobo,
          idempotencyKey: payKey.current,
        },
      });
      payKey.current = "";
      setWallet(data.wallet);
      setSent(data);
      setNaira("");
      setAccountNumber("");
      setRecipient(null);
      toast(data.message);
    } catch (error) {
      if (!error.status || error.status < 500) payKey.current = "";
      toast(error.message, "error");
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="section page wrap">
      <header className="shop-head">
        <div>
          <p className="eyebrow mono">Wallet</p>
          <h1 className="title">Send money</h1>
        </div>
        <Link className="button ghost" to="/wallet">
          Back to wallet
        </Link>
      </header>

      {loading ? (
        <p className="muted">Loading your wallet…</p>
      ) : !wallet ? (
        <p className="muted">We could not open your wallet. Refresh the page and try again.</p>
      ) : (
        <form className="glass topup-card transfer-card" onSubmit={send}>
          <p className="eyebrow mono">From account {wallet.accountNumber}</p>
          <strong className="transfer-balance">{formatPrice(wallet.balanceKobo)}</strong>
          <p className="muted">The other person sees this as money received in their wallet.</p>

          <label>
            <span>Their account number</span>
            <input
              className="field"
              inputMode="numeric"
              autoComplete="off"
              maxLength={10}
              placeholder="10 digits"
              value={accountNumber}
              onChange={(event) => setAccountNumber(event.target.value.replace(/\D/g, "").slice(0, 10))}
              required
            />
          </label>
          {recipient ? <p className="recipient-line">{recipient.name}</p> : null}
          {lookupError ? <p className="error">{lookupError}</p> : null}

          <label>
            <span>Amount, in naira</span>
            <input
              className="field"
              inputMode="numeric"
              value={naira}
              onChange={(event) => setNaira(event.target.value)}
              min="1"
              required
            />
          </label>

          {sent ? (
            <p className="pay-note">
              {sent.message} Balance {formatPrice(wallet.balanceKobo)}.
            </p>
          ) : null}

          <button
            className="button grow"
            type="submit"
            disabled={sending || wallet.status !== "active" || !recipient}
          >
            {sending ? "Sending…" : "Send"}
          </button>
        </form>
      )}
    </section>
  );
}
