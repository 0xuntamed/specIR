// @appspec:generated — do not edit
import { Link, useNavigate } from "react-router";
import { type RegisterRequest, api } from "../api";
import { Form } from "../components/kit";
import { type FieldDef, initialValues } from "../lib/fields";
import { HOME, session } from "../session";

const fields: FieldDef[] = [
  { name: "email", label: "Email", kind: "email", required: true },
  { name: "password", label: "Password", kind: "password", required: true },
];

export function RegisterPage() {
  const navigate = useNavigate();
  return (
    <section className="narrow">
      <h1>Create account</h1>
      <Form
        fields={fields}
        initial={initialValues(fields)}
        submitLabel="Create account"
        onSubmit={async (body) => {
          const result = await api.auth.register(body as RegisterRequest);
          session.set(result.token);
          navigate(HOME);
        }}
      />
      <p>
        Already registered? <Link to="/login">Log in</Link>
      </p>
    </section>
  );
}
