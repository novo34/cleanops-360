'use client'
import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'

/** Local canvas only: URI never sent to a QR service or browser storage. */
export function TotpEnrollmentQr({ uri }: { uri: string }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    const target = canvas.current
    if (!target) return
    let active = true
    const clear = () => { target.getContext('2d')?.clearRect(0,0,target.width,target.height); target.width=0;target.height=0 }
    QRCode.toCanvas(target,uri,{ errorCorrectionLevel: 'M' }).then(() => {
      if (!active) clear()
    }).catch(() => { clear();if (active) setFailed(true) })
    return () => { active=false;clear() }
  },[uri])
  return <div>
    <canvas ref={canvas} role="img" aria-label="Código QR temporal para configurar tu autenticador" style={{ maxWidth:'100%',height:'auto' }} />
    {failed && <p role="status">No se pudo generar el QR. Puedes usar la URI de configuración.</p>}
  </div>
}
