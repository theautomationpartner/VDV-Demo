"use client";

import { useEffect, useState, useCallback } from "react";
import { authHeader } from "@/lib/monday-auth";
import { getTrustedDeviceToken, setMfaSessionToken, setTrustedDeviceToken } from "@/lib/client/auth-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { ShieldAlert, ShieldCheck } from "lucide-react";

/**
 * Portero global de Capa 2 (whitelist) + Capa 3 (2FA) - se monta una sola vez en
 * app/layout.js, ENVOLVIENDO las 3 apps (OC Tracker, Vale Express, Portal
 * Proveedor comparten esta misma puerta). Capa 1 (sessionToken de monday) ya se
 * valida en cada pedido individual via lib/monday-auth.js.
 *
 * Si AUTH_LAYERS_ENABLED=false en el servidor (o DEMO_MODE=true), /api/auth/status
 * devuelve 'ready' de entrada y esto es un pass-through invisible.
 */
export function AuthGate({ children }) {
  const [state, setState] = useState({ phase: "loading" });

  const checkStatus = useCallback(async () => {
    try {
      const headers = await authHeader();
      const trustedDevice = getTrustedDeviceToken();
      if (trustedDevice) headers["X-Trusted-Device"] = trustedDevice;

      const res = await fetch("/api/auth/status", { headers });
      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        setState({ phase: "blocked", code: json.code });
        return;
      }

      if (json.status === "ready") {
        setMfaSessionToken(json.mfaSessionToken);
        setState({ phase: "ready" });
      } else if (json.status === "needs_setup") {
        setState({ phase: "needs_setup" });
      } else if (json.status === "needs_code") {
        setState({ phase: "needs_code" });
      } else {
        setState({ phase: "blocked" });
      }
    } catch (err) {
      console.error("[AuthGate] Error consultando /api/auth/status:", err);
      setState({ phase: "error" });
    }
  }, []);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  if (state.phase === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="size-8" />
      </div>
    );
  }

  if (state.phase === "ready") {
    return children;
  }

  if (state.phase === "blocked") {
    return <BlockedScreen />;
  }

  if (state.phase === "error") {
    return <ErrorScreen onRetry={checkStatus} />;
  }

  if (state.phase === "needs_setup") {
    return <SetupScreen onDone={() => setState({ phase: "ready" })} />;
  }

  return <CodeScreen onDone={() => setState({ phase: "ready" })} />;
}

function BlockedScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center p-8">
      <Card className="max-w-sm p-6 text-center space-y-3">
        <ShieldAlert className="mx-auto w-10 h-10 text-destructive" />
        <h1 className="text-lg font-semibold">Sin acceso</h1>
        <p className="text-sm text-muted-foreground">
          No tenés acceso a esta aplicación. Contactá al administrador.
        </p>
      </Card>
    </div>
  );
}

function ErrorScreen({ onRetry }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-8">
      <Card className="max-w-sm p-6 text-center space-y-3">
        <ShieldAlert className="mx-auto w-10 h-10 text-muted-foreground" />
        <h1 className="text-lg font-semibold">Error de conexión</h1>
        <p className="text-sm text-muted-foreground">No se pudo verificar el acceso. Probá de nuevo.</p>
        <Button onClick={onRetry}>Reintentar</Button>
      </Card>
    </div>
  );
}

function SetupScreen({ onDone }) {
  const [loading, setLoading] = useState(true);
  const [qrDataUrl, setQrDataUrl] = useState(null);
  const [secretBase32, setSecretBase32] = useState(null);
  const [code, setCode] = useState("");
  const [trustDevice, setTrustDevice] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const headers = await authHeader();
        const res = await fetch("/api/auth/mfa/setup", { method: "POST", headers });
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
  }, []);

  const handleConfirm = async (e) => {
    e.preventDefault();
    if (!code.trim() || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const headers = { ...(await authHeader()), "Content-Type": "application/json" };
      const res = await fetch("/api/auth/mfa/confirm", {
        method: "POST",
        headers,
        body: JSON.stringify({ code: code.trim(), trustDevice }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Código inválido");

      setMfaSessionToken(json.mfaSessionToken);
      if (json.trustedDeviceToken) setTrustedDeviceToken(json.trustedDeviceToken);
      setRecoveryCodes(json.recoveryCodes);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (recoveryCodes) {
    return (
      <div className="flex min-h-screen items-center justify-center p-8">
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
          <Button className="w-full" onClick={onDone}>
            Ya los guardé, continuar
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-8">
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
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input type="checkbox" checked={trustDevice} onChange={(e) => setTrustDevice(e.target.checked)} />
                Confiar en este dispositivo por 30 días
              </label>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={submitting}>
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

function CodeScreen({ onDone }) {
  const [code, setCode] = useState("");
  const [useRecovery, setUseRecovery] = useState(false);
  const [trustDevice, setTrustDevice] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!code.trim() || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const headers = { ...(await authHeader()), "Content-Type": "application/json" };
      const body = useRecovery ? { recoveryCode: code.trim(), trustDevice } : { code: code.trim(), trustDevice };
      const res = await fetch("/api/auth/mfa/verify", { method: "POST", headers, body: JSON.stringify(body) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Código inválido");

      setMfaSessionToken(json.mfaSessionToken);
      if (json.trustedDeviceToken) setTrustedDeviceToken(json.trustedDeviceToken);
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-8">
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
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={trustDevice} onChange={(e) => setTrustDevice(e.target.checked)} />
            Confiar en este dispositivo por 30 días
          </label>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={submitting}>
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
