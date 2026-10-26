import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, phoneForWallet } from "../api";
import { getToken } from "../auth";
import { useApp } from "../store";

export default function Profile() {
  const { user, login, toast } = useApp();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const nextParam = params.get("next") || "";
  const next = /^\/(?!\/)/.test(nextParam) ? nextParam : "";
  const fromWallet = next.startsWith("/wallet");
  const [form, setForm] = useState(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    setForm({
      firstName: user.firstName || "",
      lastName: user.lastName || "",
      phone: user.phone || "",
      line1: user.address?.line1 || "",
      city: user.address?.city || "",
      state: user.address?.state || "",
    });
  }, [user]);

  if (!user && getToken()) {
    return (
      <section className="panel glass page">
        <p className="muted">Opening your profile…</p>
      </section>
    );
  }

  if (!user) {
    return (
      <section className="panel glass page">
        <p className="eyebrow mono">Profile</p>
        <h1 className="title">Sign in to edit your profile.</h1>
        <Link className="button" to={`/login?next=${encodeURIComponent(next || "/profile")}`}>
          Sign in
        </Link>
      </section>
    );
  }

  const update = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({
      ...current,
      [name]: name === "phone" ? value.replace(/\D/g, "").slice(0, 11) : value,
    }));
  };

  const save = async (event) => {
    event.preventDefault();
    setError("");
    if (!phoneForWallet(form.phone)) {
      setError("Use an 11-digit phone number starting with 0.");
      return;
    }
    setPending(true);
    try {
      const data = await api("/api/v1/user/me", {
        method: "PATCH",
        token: getToken(),
        body: {
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          phone: form.phone.trim(),
          address: {
            line1: form.line1.trim(),
            city: form.city.trim(),
            state: form.state.trim(),
          },
        },
      });
      login(data.user);
      toast("Profile updated");
      if (next) navigate(next, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setPending(false);
    }
  };

  return (
    <section className="section page wrap">
      <header className="shop-head">
        <div>
          <p className="eyebrow mono">Profile</p>
          <h1 className="title">{user.firstName} {user.lastName}</h1>
        </div>
      </header>

      {fromWallet ? (
        <p className="notice glass">
          Add a phone number to open your wallet. The account number is that phone with the first 0 removed.
        </p>
      ) : null}

      {form ? (
        <form className="glass topup-card transfer-card" onSubmit={save}>
          <label>
            <span>First name</span>
            <input className="field" name="firstName" value={form.firstName} onChange={update} required maxLength={50} />
          </label>
          <label>
            <span>Last name</span>
            <input className="field" name="lastName" value={form.lastName} onChange={update} required maxLength={50} />
          </label>
          <label>
            <span>Email</span>
            <input className="field" value={user.email} readOnly />
          </label>
          <label>
            <span>Phone number</span>
            <input
              className="field"
              name="phone"
              inputMode="numeric"
              autoComplete="tel"
              placeholder="08012345678"
              value={form.phone}
              onChange={update}
              required
            />
          </label>
          <label>
            <span>Address</span>
            <input className="field" name="line1" value={form.line1} onChange={update} maxLength={120} />
          </label>
          <label>
            <span>City</span>
            <input className="field" name="city" value={form.city} onChange={update} maxLength={80} />
          </label>
          <label>
            <span>State</span>
            <input className="field" name="state" value={form.state} onChange={update} maxLength={80} />
          </label>
          {error ? <p className="error">{error}</p> : null}
          <button className="button grow" type="submit" disabled={pending}>
            {pending ? "Saving…" : fromWallet ? "Save and open wallet" : "Save profile"}
          </button>
        </form>
      ) : (
        <p className="muted">Loading your profile…</p>
      )}
    </section>
  );
}
