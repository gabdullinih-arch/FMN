import { useEffect, useState } from "react";
import { Bell, BellRing } from "lucide-react";
import {
  isPermissionGranted,
  requestPermission as requestNativePermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { t } from "../i18n.js";

export function NotificationsSettings({ language, enabled, leadMin, onToggle, onLeadChange }) {
  const [permission, setPermission] = useState("checking");
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    isPermissionGranted()
      .then((granted) => {
        if (active) setPermission(granted ? "granted" : "default");
      })
      .catch((reason) => {
        if (!active) return;
        setPermission("unsupported");
        setError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => { active = false; };
  }, []);

  async function requestPermission() {
    try {
      const result = await requestPermissionNative();
      setPermission(result);
      if (result === "granted") onToggle(true);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  async function testNotification() {
    try {
      await sendNotification({
        title: t("Незабудка · FMN", language),
        body: t("Если вы это видите — уведомления работают.", language),
      });
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  return (
    <div className="notif-block">
      <div className="template-group-title">Уведомления</div>
      {permission === "checking" && <div className="hint-text">Проверка разрешения уведомлений…</div>}
      {permission === "unsupported" && <div className="hint-text">Уведомления недоступны: {error}</div>}

      {permission !== "checking" && permission !== "unsupported" && (
        <>
          <div className="hint-text" style={{ marginBottom: 6 }}>
            Напоминают о ближайших делах, пока приложение запущено - если его закрыть, уведомления идти не будут (это не фоновая служба ОС).
          </div>

          {permission === "denied" && (
            <div className="hint-text">Заблокированы в настройках окна/ОС - включите вручную там и перезапустите приложение.</div>
          )}

          {permission === "default" && (
            <button onClick={requestPermission} className="btn btn-ghost btn-sm theme-toggle-btn"><Bell size={13} /> Включить уведомления</button>
          )}

          {permission === "granted" && (
            <>
              <label className="field-inline">
                <input type="checkbox" checked={enabled} onChange={(e) => onToggle(e.target.checked)} />
                напоминать о делах
              </label>
              {enabled && (
                <label className="field-inline">за сколько минут
                  <select value={leadMin} onChange={(e) => onLeadChange(Number(e.target.value))} className="time-input">
                    {[5, 10, 15, 30].map((m) => <option key={m} value={m}>{m} мин</option>)}
                  </select>
                </label>
              )}
              <button onClick={testNotification} className="btn btn-ghost btn-sm theme-toggle-btn"><BellRing size={13} /> Проверить</button>
            </>
          )}
        </>
      )}
      {error && permission !== "unsupported" && <div className="hint-text" role="alert">{error}</div>}
    </div>
  );
}
