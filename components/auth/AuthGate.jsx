"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { ShieldAlert, ShieldCheck, Mail } from "lucide-react";
import { seedAppSessionFromEmail } from "@/lib/client/fixed-accounts";
import { esRutaPublica } from "@/lib/rutas-publicas";

/**
 * Login propio de la app (whitelist de emails + 2FA) - se monta una sola vez en
 * app/layout.js, ENVOLVIENDO las 3 apps (OC Tracker, Vale Express, Portal
 * Proveedor comparten esta misma puerta). No depende de monday.com para nada de
 * esto: la app es standalone, monday es solo fuente de datos server-side.
 *
 * Si AUTH_LAYERS_ENABLED=false en el servidor (o DEMO_MODE=true), /api/auth/status
 * devuelve 'ready' de entrada y esto es un pass-through invisible.
 */
export function AuthGate({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState({ phase: "loading" });
  // La validacion de una OC la abre el proveedor desde el QR del documento, sin
  // cuenta en la app. Ver lib/rutas-publicas.js.
  const publica = esRutaPublica(pathname);

  useEffect(() => {
    if (publica) return;
    fetch("/api/auth/status")
      .then((res) => res.json())
      .then((json) => {
        // Sesion global ya activa (cookie valida de un login anterior, o recarga
        // de pagina) - autocompleta ve_session/pp_session igual que en un login
        // recien hecho, pero SIN redirigir (no hay que sacar a nadie de donde
        // ya esta navegando solo por refrescar la pagina).
        if (json.status === "ready" && json.email) seedAppSessionFromEmail(json.email, json);
        setState(json.status === "ready" ? { phase: "ready" } : { phase: "login" });
      })
      .catch(() => setState({ phase: "error" }));
  }, [publica]);

  // Login recien completado (email + 2FA, o sin 2FA si MFA_REQUIRED=false): el
  // servidor ya resolvio a que app pertenece esta cuenta y que rol tiene ahi
  // adentro (whitelist -> tabla usuarios_autorizados), asi que autocompleta la
  // sesion de Vale Express / Portal Proveedor y lleva directo al dashboard -
  // pedirle el email de nuevo ahi adentro seria un segundo login redundante.
  const handleLoginDone = (json) => {
    const seeded = json?.email ? seedAppSessionFromEmail(json.email, json) : null;
    setState({ phase: "ready" });
    if (seeded) router.push(seeded.dashboardPath);
  };

  if (publica) return children;

  if (state.phase === "loading") {
    return (
      <div className="flex w-full min-h-screen items-center justify-center">
        <Spinner className="size-8" />
      </div>
    );
  }

  if (state.phase === "ready") {
    return children;
  }

  if (state.phase === "error") {
    return (
      <div className="flex w-full min-h-screen items-center justify-center p-8">
        <Card className="max-w-sm p-6 text-center space-y-3">
          <ShieldAlert className="mx-auto w-10 h-10 text-muted-foreground" />
          <h1 className="text-lg font-semibold">Error de conexión</h1>
          <p className="text-sm text-muted-foreground">No se pudo verificar el acceso. Recargá la página.</p>
        </Card>
      </div>
    );
  }

  return <LoginFlow onDone={handleLoginDone} />;
}

function LoginFlow({ onDone }) {
  // step: 'email' -> 'setup' (primera vez, hay que escanear QR) -> 'code' (ya
  // tiene 2FA configurado, solo pide el codigo) -> 'blocked' (email no autorizado)
  const [step, setStep] = useState("email");
  const [preAuthToken, setPreAuthToken] = useState(null);

  if (step === "email") {
    return (
      <EmailScreen
        onAuthorized={(token, status, authorizedEmail, json) => {
          if (status === "ready") return onDone(json); // MFA_REQUIRED=false: la whitelist ya alcanza
          setPreAuthToken(token);
          setStep(status === "needs_setup" ? "setup" : "code");
        }}
        onBlocked={() => setStep("blocked")}
      />
    );
  }

  if (step === "blocked") {
    return (
      <div className="flex w-full min-h-screen items-center justify-center p-8">
        <Card className="max-w-sm p-6 text-center space-y-3">
          <ShieldAlert className="mx-auto w-10 h-10 text-destructive" />
          <h1 className="text-lg font-semibold">Sin acceso</h1>
          <p className="text-sm text-muted-foreground">
            No tenés acceso a esta aplicación. Contactá al administrador.
          </p>
          <Button variant="outline" className="w-full" onClick={() => setStep("email")}>
            Volver
          </Button>
        </Card>
      </div>
    );
  }

  if (step === "setup") {
    return <SetupScreen preAuthToken={preAuthToken} onDone={onDone} />;
  }

  return (
    <CodeScreen
      preAuthToken={preAuthToken}
      onDone={onDone}
      onNeedsSetup={() => setStep("setup")}
    />
  );
}

function EmailScreen({ onAuthorized, onBlocked }) {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim() || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (res.status === 401) return onBlocked();
        throw new Error(json.error ?? "Error al verificar el correo");
      }
      onAuthorized(json.preAuthToken, json.status, json.email ?? email.trim().toLowerCase(), json);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex w-full min-h-screen items-center justify-center p-8">
      <Card className="max-w-sm w-full p-6 space-y-4">
        <div className="text-center space-y-1">
          <h1 className="text-lg font-semibold">VDV Suite</h1>
          <p className="text-sm text-muted-foreground">Ingresá con tu correo autorizado</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label>Email</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@vdv.cl"
                autoComplete="email"
                autoFocus
                className="pl-9 h-11"
              />
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" size="lg" className="w-full h-11" disabled={submitting || !email.trim()}>
            {submitting ? "Verificando..." : "Continuar"}
          </Button>
        </form>
      </Card>
    </div>
  );
}

function SetupScreen({ preAuthToken, onDone }) {
  const [loading, setLoading] = useState(true);
  const [qrDataUrl, setQrDataUrl] = useState(null);
  const [secretBase32, setSecretBase32] = useState(null);
  const [code, setCode] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState(null);
  const [confirmedJson, setConfirmedJson] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/auth/mfa/setup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ preAuthToken }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Error iniciando el setup de 2FA");
        setQrDataUrl(json.qrDataUrl);
        setSecretBase32(json.secretBase32);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [preAuthToken]);

  const handleConfirm = async (e) => {
    e.preventDefault();
    if (!code.trim() || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/auth/mfa/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preAuthToken, code: code.trim(), remember }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Código inválido");
      setConfirmedJson(json);
      setRecoveryCodes(json.recoveryCodes);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (recoveryCodes) {
    return (
      <div className="flex w-full min-h-screen items-center justify-center p-8">
        <Card className="max-w-md w-full p-6 space-y-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-emerald-500" />
            <h1 className="text-lg font-semibold">2FA activado</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Guardá estos 10 códigos de recuperación en un lugar seguro. Cada uno sirve una sola vez, por si
            perdés el celular. No se van a volver a mostrar.
          </p>
          <div className="grid grid-cols-2 gap-2 font-mono text-sm bg-muted rounded-md p-3">
            {recoveryCodes.map((c) => (
              <div key={c}>{c}</div>
            ))}
          </div>
          <Button className="w-full" onClick={() => onDone(confirmedJson)}>
            Ya los guardé, continuar
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex w-full min-h-screen items-center justify-center p-8">
      <Card className="max-w-md w-full p-6 space-y-4">
        <h1 className="text-lg font-semibold">Configurar verificación en dos pasos</h1>
        <p className="text-sm text-muted-foreground">
          Escaneá este código con Google Authenticator, Microsoft Authenticator, Authy o 1Password.
        </p>
        {loading ? (
          <div className="flex justify-center py-6">
            <Spinner className="size-6" />
          </div>
        ) : qrDataUrl ? (
          <>
            <img src={qrDataUrl} alt="Código QR de 2FA" className="mx-auto w-48 h-48" />
            {secretBase32 && (
              <p className="text-center text-xs text-muted-foreground font-mono break-all">
                O escribilo a mano: {secretBase32}
              </p>
            )}
            <form onSubmit={handleConfirm} className="space-y-3">
              <div className="space-y-1.5">
                <Label>Código de 6 dígitos</Label>
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  inputMode="numeric"
                  maxLength={6}
                  autoFocus
                  placeholder="123456"
                  className="h-11"
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                Mantener la sesión iniciada 30 días en este dispositivo
              </label>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" size="lg" className="w-full h-11" disabled={submitting}>
                {submitting ? "Verificando..." : "Confirmar"}
              </Button>
            </form>
          </>
        ) : (
          <p className="text-sm text-destructive">{error || "No se pudo generar el código QR."}</p>
        )}
      </Card>
    </div>
  );
}

function CodeScreen({ preAuthToken, onDone, onNeedsSetup }) {
  const [code, setCode] = useState("");
  const [useRecovery, setUseRecovery] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!code.trim() || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const body = useRecovery
        ? { preAuthToken, recoveryCode: code.trim(), remember }
        : { preAuthToken, code: code.trim(), remember };
      const res = await fetch("/api/auth/mfa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Código inválido");
      if (json.status === "needs_setup") return onNeedsSetup();
      onDone(json);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex w-full min-h-screen items-center justify-center p-8">
      <Card className="max-w-sm w-full p-6 space-y-4">
        <h1 className="text-lg font-semibold">Verificación en dos pasos</h1>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label>{useRecovery ? "Código de recuperación" : "Código de 6 dígitos"}</Label>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode={useRecovery ? "text" : "numeric"}
              maxLength={useRecovery ? 9 : 6}
              autoFocus
              placeholder={useRecovery ? "XXXX-XXXX" : "123456"}
              className="h-11"
            />
            {useRecovery && (
              <p className="text-xs text-muted-foreground">
                Al usarlo te vamos a pedir configurar el 2FA de nuevo (QR nuevo) - el celular anterior deja de
                servir.
              </p>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            Mantener la sesión iniciada 30 días en este dispositivo
          </label>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" size="lg" className="w-full h-11" disabled={submitting}>
            {submitting ? "Verificando..." : "Verificar"}
          </Button>
          <button
            type="button"
            className="text-xs text-muted-foreground underline w-full text-center"
            onClick={() => {
              setUseRecovery((v) => !v);
              setCode("");
              setError("");
            }}
          >
            {useRecovery ? "Usar código de la app en su lugar" : "Perdí el celular, usar código de recuperación"}
          </button>
        </form>
      </Card>
    </div>
  );
}
