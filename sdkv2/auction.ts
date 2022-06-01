import * as anchor from "@project-serum/anchor";
import { BN } from "@project-serum/anchor";
import { PublicKey, Keypair } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import nacl from "tweetnacl";
import { getAuctionAddresses } from "./utils/findProgramTools";

export interface Auction {
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

export async function initAuctionObj(
  programId: PublicKey,
  walletPk: PublicKey,
  auctionId: Uint8Array,
  baseMintPk: PublicKey,
  quoteMintPk: PublicKey,
  areAsksEncrypted: boolean,
  areBidsEncrypted: boolean,
  minBaseOrderSize: BN,
  tickSize: BN,
  orderPhaseLength: number,
  decryptionPhaseLength: number
): Promise<Auction> {
  let nowBn = new anchor.BN(Date.now() / 1000);
  const { auctionPk, quoteVault, baseVault } = await getAuctionAddresses(
    auctionId,
    walletPk,
    programId
  );
  let eventQueueKeypair = new anchor.web3.Keypair();
  let eventQueue = eventQueueKeypair.publicKey;
  let bidsKeypair = new anchor.web3.Keypair();
  let bids = bidsKeypair.publicKey;
  let asksKeypair = new anchor.web3.Keypair();
  let asks = asksKeypair.publicKey;
  let naclKeypair = nacl.box.keyPair();
  let naclPubkey = Buffer.from(naclKeypair.publicKey);
  return {
    auctioneer: walletPk,
    auction: auctionPk,
    eventQueue,
    eventQueueKeypair,
    bids,
    bidsKeypair,
    asks,
    asksKeypair,
    quoteMint: quoteMintPk,
    baseMint: baseMintPk,
    quoteVault,
    baseVault,
    rent: anchor.web3.SYSVAR_RENT_PUBKEY,
    tokenProgram: TOKEN_PROGRAM_ID,
    systemProgram: anchor.web3.SystemProgram.programId,
    // Args
    auctionId,
    startOrderPhase: nowBn,
    endOrderPhase: nowBn.add(new anchor.BN(orderPhaseLength)),
    endDecryptionPhase: nowBn.add(
      new anchor.BN(orderPhaseLength + decryptionPhaseLength)
    ),
    areAsksEncrypted,
    areBidsEncrypted,
    minBaseOrderSize,
    tickSize,
    naclKeypair,
    naclPubkey,
  };
}
