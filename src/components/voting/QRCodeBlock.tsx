import * as React from "react";
import { Button } from "@/components/ui/button";
import { Copy, Check, Download, QrCode } from "lucide-react";
import { getVotingStrings } from "@/lib/voting-i18n";

interface QRCodeBlockProps {
  slug: string;
  className?: string;
}

const QRCodeBlock: React.FC<QRCodeBlockProps> = ({ slug, className }) => {
  const t = getVotingStrings();
  const [copied, setCopied] = React.useState(false);
  const [qrError, setQrError] = React.useState(false);

  const publicUrl =
    typeof window !== "undefined" ? `${window.location.origin}/v/${slug}` : "";

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textArea = document.createElement("textarea");
      textArea.value = publicUrl;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownloadPNG = () => {
    const link = document.createElement("a");
    link.href = `/api/votes/${slug}/qr.png`;
    link.download = `vote-${slug}-qr.png`;
    link.click();
  };

  return (
    <div className={className}>
      <div className="flex items-center gap-2 mb-3">
        <QrCode className="w-4 h-4 text-gray-500" />
        <h3 className="text-sm font-medium text-gray-700">{t.buttons.share}</h3>
      </div>
      <div className="flex items-center gap-2 mb-3">
        <code className="text-sm bg-gray-100 px-3 py-1.5 rounded flex-1 truncate select-all">
          {publicUrl}
        </code>
        <Button size="sm" variant="outline" onClick={handleCopyLink}>
          {copied ? (
            <Check className="w-4 h-4 mr-1" />
          ) : (
            <Copy className="w-4 h-4 mr-1" />
          )}
          {copied ? t.buttons.copied : t.buttons.copy}
        </Button>
      </div>
      <div className="flex flex-col items-center gap-2">
        {!qrError ? (
          <img
            src={`/api/votes/${slug}/qr.svg`}
            alt="QR Code"
            className="w-40 h-40"
            onError={() => setQrError(true)}
          />
        ) : (
          <div className="w-40 h-40 flex items-center justify-center bg-gray-100 rounded text-gray-400 text-xs text-center">
            {t.messages.qrCodeUnavailable}
          </div>
        )}
        <p className="text-xs text-gray-400 text-center">
          {t.messages.scanToVote}
        </p>
        <Button size="sm" variant="ghost" onClick={handleDownloadPNG}>
          <Download className="w-3 h-3 mr-1" />
          {t.buttons.downloadPng}
        </Button>
      </div>
    </div>
  );
};

export default QRCodeBlock;