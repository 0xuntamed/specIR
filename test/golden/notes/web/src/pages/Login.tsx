// @appspec:generated — do not edit
import { Link, useNavigate, useSearchParams } from "react-router";
import { type LoginRequest, api } from "../api";
import { Form } from "../components/kit";
import { type FieldDef, initialValues } from "../lib/fields";
import { nextPath, session } from "../session";

const fields: FieldDef[] = [
  { name: "email", label: "Email", kind: "email", required: true },
  { name: "password", label: "Password", kind: "password", required: true },
];

export function LoginPage() {
  const navigate = useNavigate();
  const [search] = useSearchParams();
  return (
    <section className="narrow">
      <h1>Log in</h1>
      <Form
        fields={fields}
        initial={initialValues(fields)}
        submitLabel="Log in"
        onSubmit={async (body) => {
          const result = await api.auth.login(body as LoginRequest);
          session.set(result.token);
          navigate(nextPath(search.get("next")));
        }}
      />
      <p>
        No account yet? <Link to="/register">Create one</Link>
      </p>
    </section>
  );
}
