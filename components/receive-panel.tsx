import QRCode from "qrcode";
import { CopyButton } from "@/components/copy-button";
import { explorerAddressUrl } from "@/lib/ethereum";

export async function ReceivePanel({
  address,
  embedded = false,
}: {
  address: string | null;
  embedded?: boolean;
}) {
  if (!address) {
    return (
      <div className="receive-panel-body">
        <p className="quiet">
          An Ethereum deposit address will appear when <code>ETH_MASTER_SEED</code> is configured. Do
          not invent an address.
        </p>
      </div>
    );
  }

  const qr = await QRCode.toDataURL(address, {
    margin: 1,
    width: 168,
    color: { dark: "#142536", light: "#f5faff" },
  });

  const body = (
    <div className="receive-panel-body">
      <p className="quiet">Charge with USDT on Ethereum only.</p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="qr" src={qr} alt="QR code for the Ethereum deposit address" width={168} height={168} />
      <code className="address-block">{address}</code>
      <div className="row-actions">
        <CopyButton value={address} label="Copy address" />
        <a className="secondary-link" href={explorerAddressUrl(address)} target="_blank" rel="noreferrer">
          Open on Etherscan
        </a>
      </div>
    </div>
  );

  if (embedded) return body;

  return (
    <article className="card stack receive">
      <h2>Receive</h2>
      {body}
    </article>
  );
}
