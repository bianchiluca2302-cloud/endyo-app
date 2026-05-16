"""
Firebase Cloud Messaging — invio notifiche push.

Richiede la variabile d'ambiente FIREBASE_SERVICE_ACCOUNT con il JSON del
service account (può essere JSON diretto o base64-encoded).
Se la variabile non è presente, le notifiche vengono ignorate silenziosamente.
"""
import os
import json
import base64
import asyncio

_firebase_initialized = False
_firebase_ok = False
_fcm_messaging = None


def _init_firebase():
    global _firebase_initialized, _firebase_ok, _fcm_messaging
    if _firebase_initialized:
        return _firebase_ok
    _firebase_initialized = True

    sa_env = os.getenv("FIREBASE_SERVICE_ACCOUNT", "").strip()
    if not sa_env:
        print("[FCM] FIREBASE_SERVICE_ACCOUNT non impostata — push disabilitate")
        return False

    try:
        import firebase_admin
        from firebase_admin import credentials, messaging
        _fcm_messaging = messaging

        # Supporta JSON diretto o base64
        if sa_env.startswith("{"):
            sa_dict = json.loads(sa_env)
        else:
            sa_dict = json.loads(base64.b64decode(sa_env + "=="))

        cred = credentials.Certificate(sa_dict)
        firebase_admin.initialize_app(cred)
        _firebase_ok = True
        print("[FCM] Firebase Admin inizializzato correttamente")
    except Exception as e:
        print(f"[FCM] Errore inizializzazione: {e}")
    return _firebase_ok


async def send_push(fcm_token: str, title: str, body: str, data: dict | None = None):
    """
    Invia una notifica push a un singolo dispositivo.
    Non solleva eccezioni — i fallimenti vengono loggati e ignorati.
    """
    if not fcm_token:
        return
    if not _init_firebase():
        return

    def _send():
        try:
            msg = _fcm_messaging.Message(
                notification=_fcm_messaging.Notification(title=title, body=body),
                data={str(k): str(v) for k, v in (data or {}).items()},
                token=fcm_token,
                android=_fcm_messaging.AndroidConfig(priority="high"),
                apns=_fcm_messaging.APNSConfig(
                    payload=_fcm_messaging.APNSPayload(
                        aps=_fcm_messaging.Aps(sound="default")
                    )
                ),
            )
            _fcm_messaging.send(msg)
        except Exception as e:
            print(f"[FCM] Errore invio: {e}")

    # Esegui in thread per non bloccare l'event loop (firebase-admin è sincrono)
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _send)
