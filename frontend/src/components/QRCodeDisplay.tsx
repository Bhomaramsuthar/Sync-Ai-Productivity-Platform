import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Copy, Check, Download, QrCode as QrIcon } from 'lucide-react';
import { toast } from '../utils/toast';

interface QRCodeDisplayProps {
  url: string;
  size?: number;
  workspaceName?: string;
}

export const QRCodeDisplay: React.FC<QRCodeDisplayProps> = ({
  url,
  size = 200,
  workspaceName = 'Workspace',
}) => {
  const [svgMarkup, setSvgMarkup] = useState<string>('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!url) return;
    QRCode.toString(url, {
      type: 'svg',
      margin: 1,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    })
      .then((svg) => {
        setSvgMarkup(svg);
      })
      .catch((err) => {
        console.error('Failed to generate QR code SVG:', err);
      });
  }, [url]);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success('Link Copied', 'Invitation URL copied to clipboard.');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!svgMarkup) return;
    const blob = new Blob([svgMarkup], { type: 'image/svg+xml' });
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = `${workspaceName.toLowerCase().replace(/[^a-z0-9]/g, '-')}-invite-qr.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(blobUrl);
    toast.info('QR Code Downloaded', 'Saved as high-resolution SVG file.');
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '1.25rem',
        borderRadius: '16px',
        background: 'rgba(255, 255, 255, 0.03)',
        border: '1px solid var(--border-subtle)',
        gap: '1rem',
      }}
    >
      <div
        style={{
          padding: '12px',
          background: '#ffffff',
          borderRadius: '14px',
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: size + 24,
          height: size + 24,
        }}
      >
        {svgMarkup ? (
          <div
            dangerouslySetInnerHTML={{ __html: svgMarkup }}
            style={{ width: size, height: size }}
          />
        ) : (
          <div
            style={{
              width: size,
              height: size,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#64748b',
            }}
          >
            <QrIcon size={32} />
          </div>
        )}
      </div>

      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
          Scan with Mobile Camera
        </div>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
          Instantly joins or requests access to {workspaceName}
        </p>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', width: '100%', justifyContent: 'center' }}>
        <button
          onClick={handleCopyLink}
          className="btn btn-secondary btn-sm"
          style={{ fontSize: '0.75rem', padding: '0.4rem 0.8rem', gap: '6px' }}
        >
          {copied ? <Check size={14} style={{ color: '#10b981' }} /> : <Copy size={14} />}
          <span>{copied ? 'Copied' : 'Copy Link'}</span>
        </button>

        <button
          onClick={handleDownload}
          className="btn btn-secondary btn-sm"
          style={{ fontSize: '0.75rem', padding: '0.4rem 0.8rem', gap: '6px' }}
          title="Download vector SVG QR code"
        >
          <Download size={14} />
          <span>Save SVG</span>
        </button>
      </div>
    </div>
  );
};
