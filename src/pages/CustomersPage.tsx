import { useEffect, useState, type FormEvent } from "react";
import { Search, UserPlus, Users } from "lucide-react";
import { api } from "../api";

type Customer = {
  id: number;
  name: string | null;
  phone: string;
  email: string | null;
  preferred_language: string;
};

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  async function loadCustomers(query = "") {
    setLoading(true);
    try {
      const res = await api<{ customers: Customer[] }>(
        `/api/customers${query ? `?search=${encodeURIComponent(query)}` : ""}`
      );
      setCustomers(res.customers);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCustomers();
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => loadCustomers(search), 350);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  async function handleAddCustomer(event: FormEvent) {
    event.preventDefault();
    setFormError("");
    setSaving(true);

    try {
      await api("/api/customers", {
        method: "POST",
        body: { name, phone, email },
      });
      setName("");
      setPhone("");
      setEmail("");
      setShowForm(false);
      loadCustomers(search);
    } catch (err: any) {
      setFormError(err.message || "Could not add customer.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="welcome-row">
        <div>
          <h2>Customers</h2>
          <p>Everyone who has called or been added to your system.</p>
        </div>
        <button
          className="primary-button"
          onClick={() => setShowForm((v) => !v)}
        >
          <UserPlus size={17} /> Add Customer
        </button>
      </div>

      {showForm && (
        <section className="panel form-panel">
          <form onSubmit={handleAddCustomer} className="inline-form">
            <input
              placeholder="Full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <input
              placeholder="Phone number (required)"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />
            <input
              placeholder="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button
              type="submit"
              className="primary-button"
              disabled={saving}
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </form>
          {formError && <div className="auth-error">{formError}</div>}
        </section>
      )}

      <section className="panel">
        <div className="panel-header">
          <div>
            <h3>
              <Users size={16} style={{ verticalAlign: "-3px" }} />{" "}
              All Customers
            </h3>
            <p>{customers.length} found</p>
          </div>
          <div className="search-box">
            <Search size={17} />
            <input
              placeholder="Search name, phone, email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>Email</th>
                <th>Language</th>
              </tr>
            </thead>
            <tbody>
              {customers.length === 0 && !loading && (
                <tr>
                  <td colSpan={4} className="empty-cell">
                    No customers found.
                  </td>
                </tr>
              )}
              {customers.map((c) => (
                <tr key={c.id}>
                  <td>
                    <strong>{c.name || "Unknown"}</strong>
                  </td>
                  <td>{c.phone}</td>
                  <td>{c.email || "—"}</td>
                  <td style={{ textTransform: "uppercase" }}>
                    {c.preferred_language}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
