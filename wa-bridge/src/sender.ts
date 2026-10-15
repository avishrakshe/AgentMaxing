/**
 * WhatsAppSender: the only thing the rest of the bridge talks to.
 * BaileysSender is an UNOFFICIAL WhatsApp Web client. Swap in an official provider later by
 * implementing the same interface. (Meta's Cloud API Groups API caps groups at 8 participants and
 * needs an Official Business Account, so it can't serve community broadcasts today.)
 */
import makeWASocket, { Browsers, DisconnectReason, fetchLatestBaileysVersion, jidNormalizedUser, useMultiFileAuthState, type WASocket } from "@whiskeysockets/baileys";
import pino from "pino";
import qrcode from "qrcode-terminal";

export type GroupInfo = { jid: string; name: string; isCommunityAnnounce: boolean; isAdmin: boolean; size: number; canPost: boolean };
export type IncomingText = { from: string; text: string; quotedId?: string };

export interface WhatsAppSender {
  ready(): boolean;
  listGroups(): Promise<GroupInfo[]>;
  sendImage(jid: string, image: Buffer, caption: string): Promise<string | undefined>;
  sendText(jid: string, text: string): Promise<string | undefined>;
  onText(handler: (msg: IncomingText) => void): void;
}

export class BaileysSender implements WhatsAppSender {
  private sock: WASocket | null = null;
  private isOpen = false;
  private handlers: ((m: IncomingText) => void)[] = [];

  constructor(private authDir: string, private pairingNumber?: string) {}

  async start() {
    const { state, saveCreds } = await useMultiFileAuthState(this.authDir);
    const { version } = await fetchLatestBaileysVersion();
    const sock = makeWASocket({ version, auth: state, logger: pino({ level: "warn" }), browser: Browsers.ubuntu("Crier Bridge"), markOnlineOnConnect: false });
    this.sock = sock;

    sock.ev.on("creds.update", saveCreds);
    sock.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
      if (qr && !this.pairingNumber) {
        console.log("\nScan this QR in WhatsApp → Linked devices → Link a device:\n");
        qrcode.generate(qr, { small: true });
      }
      if (qr && this.pairingNumber && !state.creds.registered) {
        const code = await sock.requestPairingCode(this.pairingNumber.replace(/\D/g, ""));
        console.log(`\nPairing code: ${code}  (WhatsApp → Linked devices → Link with phone number)\n`);
      }
      if (connection === "open") {
        this.isOpen = true;
        console.log(`[bridge] connected as ${sock.user?.id}`);
      }
      if (connection === "close") {
        this.isOpen = false;
        const code = (lastDisconnect?.error as { output?: { statusCode?: number } })?.output?.statusCode;
        if (code === DisconnectReason.loggedOut) {
          console.error("[bridge] logged out. Delete wa-bridge/auth/ and link again.");
          return;
        }
        console.warn(`[bridge] connection closed (${code}), reconnecting in 5s`);
        setTimeout(() => this.start(), 5000);
      }
    });

    sock.ev.on("messages.upsert", ({ messages, type }) => {
      if (type !== "notify") return;
      for (const m of messages) {
        if (m.key.fromMe || !m.key.remoteJid || m.key.remoteJid.endsWith("@g.us")) continue; // DMs only
        const text = m.message?.conversation ?? m.message?.extendedTextMessage?.text;
        if (!text) continue;
        const quotedId = m.message?.extendedTextMessage?.contextInfo?.stanzaId ?? undefined;
        for (const h of this.handlers) h({ from: m.key.remoteJid, text, quotedId });
      }
    });
  }

  ready() {
    return this.isOpen && Boolean(this.sock);
  }

  private me() {
    const user = this.sock?.user;
    return new Set([user?.id, user?.lid].filter(Boolean).map((j) => jidNormalizedUser(j!)));
  }

  async listGroups(): Promise<GroupInfo[]> {
    if (!this.sock) throw new Error("not connected");
    const all = await this.sock.groupFetchAllParticipating();
    const me = this.me();
    return Object.values(all)
      .filter((g) => !g.isCommunity) // the community "parent" itself can't receive messages
      .map((g) => {
        const self = g.participants.find((p) => [p.id, p.lid, p.phoneNumber].filter(Boolean).some((j) => me.has(jidNormalizedUser(j!))));
        const isAdmin = Boolean(self?.admin);
        return {
          jid: g.id,
          name: g.subject,
          isCommunityAnnounce: Boolean(g.isCommunityAnnounce),
          isAdmin,
          size: g.size ?? g.participants.length,
          // Announcement-only groups (incl. community announcements) accept posts from admins only.
          canPost: isAdmin || !g.announce,
        };
      });
  }

  async sendImage(jid: string, image: Buffer, caption: string) {
    if (!this.sock) throw new Error("not connected");
    return (await this.sock.sendMessage(jid, { image, caption }))?.key.id ?? undefined;
  }

  async sendText(jid: string, text: string) {
    if (!this.sock) throw new Error("not connected");
    return (await this.sock.sendMessage(jid, { text }))?.key.id ?? undefined;
  }

  onText(handler: (msg: IncomingText) => void) {
    this.handlers.push(handler);
  }
}
