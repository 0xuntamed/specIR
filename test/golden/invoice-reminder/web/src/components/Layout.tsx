// @appspec:generated — do not edit
import { Link, NavLink, Outlet } from "react-router";
import { session, useToken } from "../session";

export function Layout() {
  const token = useToken();
  return (
    <>
      <header className="nav">
        <div className="container nav-inner">
          <Link className="brand" to="/">
            invoice-reminder
          </Link>
          <nav>
            {token && (
              <>
                <NavLink to="/clients">Clients</NavLink>
                <NavLink to="/invoices">Invoices</NavLink>
              </>
            )}
          </nav>
          <div className="nav-end">
            {token ? (
              <button className="link" onClick={() => session.set(null)}>
                Log out
              </button>
            ) : (
              <><NavLink to="/login">Log in</NavLink> <NavLink to="/register">Register</NavLink></>
            )}
          </div>
        </div>
      </header>
      <main className="container">
        <Outlet />
      </main>
    </>
  );
}
