import { BN } from "@project-serum/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { Auction } from "../../generated/accounts";
import * as anchor from "@project-serum/anchor";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import nacl from "tweetnacl";
import { toFp32 } from "./tools";
import { getAuctionAddresses } from "./findProgramTools";

export interface AuctionArgs {
  // Accounts
  auctioneer: PublicKey;
  auction: PublicKey;
  eventQueue: PublicKey;
  eventQueueKeypair?: Keypair;
  bids: PublicKey;
  bidsKeypair?: Keypair;
  asks: PublicKey;
  asksKeypair?: Keypair;
  quoteMint: PublicKey;
  baseMint: PublicKey;
  quoteVault: PublicKey;
  baseVault: PublicKey;
  rent: PublicKey;
  tokenProgram: PublicKey;
  systemProgram: PublicKey;
  // Args
  auctionId: Uint8Array;
  startOrderPhase: BN;
  endOrderPhase: BN;
  endDecryptionPhase: BN;
  areAsksEncrypted: boolean;
  areBidsEncrypted: boolean;
  minBaseOrderSize: BN;
  tickSize: BN; // FP32
  naclPubkey: Buffer;
  naclKeypair?: nacl.BoxKeyPair;
}

export interface CreateAskInstructionsArgs {
  wallet: PublicKey;
  programId: PublicKey;
  connection: Connection;
  amount: number;
  deposit: number;
  price: number;
  auction: Auction;
  quoteToken: PublicKey;
  baseToken: PublicKey;
  localOrderKey: nacl.BoxKeyPair;
  quoteDecimals: number;
  baseDecimals: number;
  auctionPk: PublicKey;
}
export class AuctionArgs implements AuctionArgs {
  programId: PublicKey;
  constructor({
    programId,
    wallet,
    auctionId,
    baseMint,
    quoteMint,
    areAsksEncrypted,
    areBidsEncrypted,
    minBaseOrderSize,
    tickSize,
    orderPhaseLength,
    decryptionPhaseLength,
  }: CreateAuctionArgs) {
    const nowBn = new BN(Date.now() / 1000);
    const eventQueueKeypair = new anchor.web3.Keypair();
    const eventQueue = eventQueueKeypair.publicKey;
    const bidsKeypair = new anchor.web3.Keypair();
    const bids = bidsKeypair.publicKey;
    const asksKeypair = new anchor.web3.Keypair();
    const asks = asksKeypair.publicKey;
    const localAuctionKey = nacl.box.keyPair();
    this.auctioneer = wallet;
    this.eventQueue = eventQueue;
    this.eventQueueKeypair = eventQueueKeypair;
    this.bids = bids;
    this.bidsKeypair = bidsKeypair;
    this.asks = asks;
    this.asksKeypair = asksKeypair;
    this.quoteMint = quoteMint;
    this.baseMint = baseMint;
    this.rent = anchor.web3.SYSVAR_RENT_PUBKEY;
    this.tokenProgram = TOKEN_PROGRAM_ID;
    this.systemProgram = anchor.web3.SystemProgram.programId;
    // Args
    this.auctionId = auctionId;
    this.startOrderPhase = nowBn;
    this.endOrderPhase = nowBn.add(new BN(orderPhaseLength));
    this.endDecryptionPhase = nowBn.add(
      new BN(orderPhaseLength + decryptionPhaseLength)
    );
    this.areAsksEncrypted = areAsksEncrypted;
    this.areBidsEncrypted = areBidsEncrypted;
    this.naclKeypair = localAuctionKey;
    this.naclPubkey = Buffer.from(localAuctionKey.publicKey);
    this.minBaseOrderSize = new BN(minBaseOrderSize);
    this.tickSize = toFp32(tickSize);
    this.programId = programId;
  }
  async init() {
    const { auctionPk, quoteVault, baseVault } = await getAuctionAddresses(
      this.auctionId,
      this.auctioneer,
      this.programId
    );
    this.auction = auctionPk;
    this.quoteVault = quoteVault;
    this.baseVault = baseVault;
    return this;
  }
}

interface _CreateAuctionBaseArgs {
  wallet: PublicKey;
  programId: PublicKey;
  baseMint: PublicKey;
  quoteMint: PublicKey;
  areAsksEncrypted: boolean;
  areBidsEncrypted: boolean;
  minBaseOrderSize: number;
  tickSize: number; // FP32
  orderPhaseLength: number;
  decryptionPhaseLength: number;
  eventQueueBytes: number;
  bidsBytes: number;
  asksBytes: number;
  maxOrders: number;
}
export interface CreateAuctionArgs extends _CreateAuctionBaseArgs {
  auctionId: Buffer;
}

export interface CreateAuctionInstructionsArgs extends _CreateAuctionBaseArgs {
  auctionId?: Buffer;
  connection: Connection;
}
