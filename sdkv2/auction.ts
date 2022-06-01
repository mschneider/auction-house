import * as anchor from "@project-serum/anchor";
import { BN } from "@project-serum/anchor";
import {
  PublicKey,
  Keypair,
  Transaction,
  SystemProgram,
  Connection,
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import nacl from "tweetnacl";
import { getAuctionAddresses } from "./utils/findProgramTools";
import dayjs from "dayjs";
import { handleCreateAuctionParams, toFp32 } from "./utils/tools";

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

export async function getAuctionObj({
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
}: CreateAuctionArgs): Promise<Auction> {
  let nowBn = new anchor.BN(Date.now() / 1000);
  const { auctionPk, quoteVault, baseVault } = await getAuctionAddresses(
    auctionId,
    wallet,
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
    auctioneer: wallet,
    auction: auctionPk,
    eventQueue,
    eventQueueKeypair,
    bids,
    bidsKeypair,
    asks,
    asksKeypair,
    quoteMint,
    baseMint,
    quoteVault,
    baseVault,
    rent: anchor.web3.SYSVAR_RENT_PUBKEY,
    tokenProgram: TOKEN_PROGRAM_ID,
    systemProgram: anchor.web3.SystemProgram.programId,
    // Args
    auctionId,
    startOrderPhase: nowBn,
    endOrderPhase: nowBn.add(BN(orderPhaseLength)),
    endDecryptionPhase: nowBn.add(BN(orderPhaseLength + decryptionPhaseLength)),
    areAsksEncrypted,
    areBidsEncrypted,
    naclKeypair,
    naclPubkey,
    minBaseOrderSize: new BN(minBaseOrderSize),
    tickSize: toFp32(tickSize),
  };
}

interface _CreateAuctionBaseArgs {
  wallet: PublicKey;
  programId: PublicKey;
  baseMint: PublicKey;
  quoteMint: PublicKey;
  areAsksEncrypted: boolean;
  areBidsEncrypted: boolean;
  minBaseOrderSize: BN;
  tickSize: BN; // FP32
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

export interface GetCreateAuctionInstructionsArgs
  extends _CreateAuctionBaseArgs {
  auctionId?: Buffer;
  connection: Connection;
}

export const getCreateAuctionInstructions = async ({
  connection,
  wallet,
  programId,
  baseMint,
  quoteMint,
  areAsksEncrypted,
  areBidsEncrypted,
  minBaseOrderSize,
  tickSize,
  orderPhaseLength,
  decryptionPhaseLength,
  eventQueueBytes,
  bidsBytes,
  asksBytes,
  maxOrders,
}: GetCreateAuctionInstructionsArgs) => {
  const transactions = new Transaction();
  const auctionId = Buffer.alloc(10);
  auctionId.writeUIntLE(dayjs().valueOf(), 0, 6);
  const nowBn = new BN(dayjs().unix());
  const { auctionPk, quoteVault, baseVault } = await getAuctionAddresses(
    auctionId,
    wallet,
    programId
  );
  const auctionObj = await getAuctionObj({
    wallet,
    programId,
    baseMint,
    quoteMint,
    areAsksEncrypted,
    areBidsEncrypted,
    minBaseOrderSize,
    tickSize,
    orderPhaseLength,
    decryptionPhaseLength,
    eventQueueBytes,
    bidsBytes,
    asksBytes,
    maxOrders,
    auctionId,
  });
  let eventQueueParams = await handleCreateAuctionParams({
    programId,
    wallet,
    newPubkey: auctionObj.eventQueue,
    space: eventQueueBytes,
    connection: connection,
  });
  transactions.add(SystemProgram.createAccount(eventQueueParams));
  let bidsParams = await handleCreateAuctionParams({
    programId,
    wallet,
    newPubkey: auctionObj.bids,
    space: bidsBytes,
    connection: connection,
  });
  transactions.add(SystemProgram.createAccount(bidsParams));
  let asksParams = await handleCreateAuctionParams({
    programId,
    wallet,
    newPubkey: auctionObj.asks,
    space: asksBytes,
    connection: connection,
  });
  transactions.add(SystemProgram.createAccount(asksParams));
  transactions.add(initAuction({ args: { ...auction } }, { ...auction }));
};
