import * as anchor from "@project-serum/anchor";
import { BN } from "@project-serum/anchor";
import {
  PublicKey,
  Keypair,
  Transaction,
  SystemProgram,
  Connection,
  TransactionInstruction,
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import nacl from "tweetnacl";
import {
  getAuctionAddresses,
  getOpenOrdersPk,
  getOrderHistoryPk,
} from "./utils/findProgramTools";
import dayjs from "dayjs";
import { handleCreateAuctionParams, toFp32 } from "./utils/tools";
import {
  initAuction,
  initOpenOrders,
  newEncryptedOrder,
  newOrder,
} from "../generated/instructions";
import { Auction, OpenOrders } from "../generated/accounts";
import { Side } from "../generated/types";

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
    const nowBn = new anchor.BN(Date.now() / 1000);
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
    this.endOrderPhase = nowBn.add(BN(orderPhaseLength));
    this.endDecryptionPhase = nowBn.add(
      BN(orderPhaseLength + decryptionPhaseLength)
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

export const createAuctionInstructions = async ({
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
}: CreateAuctionInstructionsArgs): Promise<{
  transactionInstructions: TransactionInstruction[];
  auction: AuctionArgs;
  localAuctionKey: nacl.BoxKeyPair;
  signers: Keypair[];
}> => {
  const transactionInstructions: TransactionInstruction[] = [];
  const auctionId = Buffer.alloc(10);
  auctionId.writeUIntLE(dayjs().valueOf(), 0, 6);
  const auction = await new AuctionArgs({
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
  }).init();
  const eventQueueParams = await handleCreateAuctionParams({
    programId,
    wallet,
    newPubkey: auction.eventQueue,
    space: eventQueueBytes,
    connection: connection,
  });
  transactionInstructions.push(SystemProgram.createAccount(eventQueueParams));
  const bidsParams = await handleCreateAuctionParams({
    programId,
    wallet,
    newPubkey: auction.bids,
    space: bidsBytes,
    connection: connection,
  });
  transactionInstructions.push(SystemProgram.createAccount(bidsParams));
  const asksParams = await handleCreateAuctionParams({
    programId,
    wallet,
    newPubkey: auction.asks,
    space: asksBytes,
    connection: connection,
  });
  transactionInstructions.push(SystemProgram.createAccount(asksParams));
  transactionInstructions.push(
    initAuction({ args: { ...auction } }, { ...auction })
  );
  const signers = [
    auction.eventQueueKeypair,
    auction.bidsKeypair,
    auction.asksKeypair,
  ];
  return {
    transactionInstructions,
    signers,
    auction,
    localAuctionKey: auction.naclKeypair,
  };
};

export const createAskInstructions = async ({
  connection,
  amount,
  price,
  deposit,
  wallet,
  programId,
  auction,
  auctionPk,
  quoteToken,
  baseToken,
  baseDecimals,
  quoteDecimals,
  localOrderKey,
}: CreateAskInstructionsArgs): Promise<TransactionInstruction[]> => {
  const transactionInstructions: TransactionInstruction[] = [];
  const openOrdersPk = await getOpenOrdersPk(
    wallet,
    auction.auctionId,
    auction.authority,
    programId
  );
  const orderHistoryPk = await getOrderHistoryPk(
    wallet,
    auction.auctionId,
    auction.authority,
    programId
  );
  const openOrders = await OpenOrders.fetch(connection, openOrdersPk);
  if (!openOrders) {
    transactionInstructions.push(
      initOpenOrders(
        { side: new Side.Ask(), maxOrders: 2 },
        {
          user: wallet,
          auction: new PublicKey(auctionPk),
          openOrders: openOrdersPk,
          orderHistory: orderHistoryPk,
          quoteMint: auction.quoteMint,
          baseMint: auction.baseMint,
          userQuote: quoteToken,
          userBase: baseToken,
          systemProgram: SystemProgram.programId,
        }
      )
    );
  }
  if (auction.areAsksEncrypted) {
    transactionInstructions.push(
      _newEncryptedOrderInstruction({
        price,
        amount,
        auction,
        baseDecimals,
        quoteDecimals,
        deposit,
        openOrdersPk,
        wallet,
        localOrderKey,
        quoteToken,
        baseToken,
        auctionPk,
      })
    );
  } else {
    transactionInstructions.push(
      newOrder(
        {
          limitPrice: _prepareLimitPrice(price, auction.tickSize),
          maxBaseQty: _prepareMaxBaseQty(amount, baseDecimals),
        },
        {
          ...auction,
          user: wallet,
          auction: new PublicKey(auctionPk),
          openOrders: openOrdersPk,
          userQuote: quoteToken,
          userBase: baseToken,
          tokenProgram: TOKEN_PROGRAM_ID,
        }
      )
    );
  }
  return transactionInstructions;
};

export const createBidInstructions = async ({
  connection,
  amount,
  price,
  deposit,
  wallet,
  programId,
  auction,
  auctionPk,
  quoteToken,
  baseToken,
  baseDecimals,
  quoteDecimals,
  localOrderKey,
}: CreateAskInstructionsArgs): Promise<TransactionInstruction[]> => {
  const transactionInstructions: TransactionInstruction[] = [];
  const openOrdersPk = await getOpenOrdersPk(
    wallet,
    auction.auctionId,
    auction.authority,
    programId
  );
  const orderHistoryPk = await getOrderHistoryPk(
    wallet,
    auction.auctionId,
    auction.authority,
    programId
  );

  const openOrders = await OpenOrders.fetch(connection, openOrdersPk);
  if (!openOrders) {
    transactionInstructions.push(
      initOpenOrders(
        { side: new Side.Bid(), maxOrders: 2 },
        {
          user: wallet,
          auction: new PublicKey(auctionPk),
          openOrders: openOrdersPk,
          orderHistory: orderHistoryPk,
          quoteMint: auction.quoteMint,
          baseMint: auction.baseMint,
          userQuote: quoteToken,
          userBase: baseToken,
          systemProgram: SystemProgram.programId,
        }
      )
    );
  }
  if (auction.areBidsEncrypted) {
    transactionInstructions.push(
      _newEncryptedOrderInstruction({
        price,
        amount,
        auction,
        baseDecimals,
        quoteDecimals,
        deposit,
        openOrdersPk,
        wallet,
        localOrderKey,
        quoteToken,
        baseToken,
        auctionPk,
      })
    );
  } else {
    transactionInstructions.push(
      newOrder(
        {
          limitPrice: _prepareLimitPrice(price, auction.tickSize),
          maxBaseQty: _prepareMaxBaseQty(amount, baseDecimals),
        },
        {
          ...auction,
          user: wallet,
          auction: new PublicKey(auctionPk),
          openOrders: openOrdersPk,
          userQuote: quoteToken,
          userBase: baseToken,
          tokenProgram: TOKEN_PROGRAM_ID,
        }
      )
    );
  }
  return transactionInstructions;
};

const _prepareLimitPrice = (price: number, tickSize: number) => {
  return new BN(price * 2 ** 32).shln(32).div(tickSize).mul(tickSize).shrn(32);
};
const _prepareMaxBaseQty = (amount: number, baseDecimals: number) => {
  return new BN(amount * Math.pow(10, baseDecimals));
};

const _newEncryptedOrderInstruction = ({
  price,
  amount,
  auction,
  baseDecimals,
  quoteDecimals,
  deposit,
  localOrderKey,
  wallet,
  openOrdersPk,
  quoteToken,
  baseToken,
  auctionPk,
}: {
  price: number;
  amount: number;
  auction: Auction;
  baseDecimals: number;
  quoteDecimals: number;
  deposit: number;
  localOrderKey: nacl.BoxKeyPair;
  wallet: PublicKey;
  openOrdersPk: PublicKey;
  quoteToken: PublicKey;
  baseToken: PublicKey;
  auctionPk: PublicKey;
}) => {
  // convert into native values
  let fp32Price = toFp32(price).shln(32).div(auction.tickSize);
  let quantity = new BN(amount * Math.pow(10, baseDecimals));
  let tokenQty = new BN(deposit * Math.pow(10, quoteDecimals));

  // encrypt native values
  let plainText = Buffer.concat(
    [fp32Price, quantity].map((bn) => {
      return bn.toArrayLike(Buffer, "le", 8);
    })
  );
  const nonce = nacl.randomBytes(nacl.box.nonceLength);

  let cipherText = nacl.box(
    Uint8Array.from(plainText),
    nonce,
    Uint8Array.from(auction.naclPubkey),
    localOrderKey.secretKey
  );

  return newEncryptedOrder(
    {
      tokenQty,
      naclPubkey: Buffer.from(
        localOrderKey.publicKey.buffer,
        localOrderKey.publicKey.byteOffset,
        localOrderKey.publicKey.length
      ),
      nonce: Buffer.from(nonce.buffer, nonce.byteOffset, nonce.length),
      cipherText: Buffer.from(
        cipherText.buffer,
        cipherText.byteOffset,
        cipherText.length
      ),
    },
    {
      ...auction,

      user: wallet,
      auction: new PublicKey(auctionPk),
      openOrders: openOrdersPk,
      userQuote: quoteToken,
      userBase: baseToken,
      tokenProgram: TOKEN_PROGRAM_ID,
    }
  );
};
