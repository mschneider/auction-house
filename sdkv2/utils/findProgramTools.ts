import { PublicKey } from "@solana/web3.js";

type GetAuctionAddressesParams = Parameters<
  (
    auctionId: Buffer | number[] | Uint8Array,
    walletPk: PublicKey,
    programPk: PublicKey
  ) => void
>;

export const getauctionPk = async (...args: GetAuctionAddressesParams) => {
  const auction = await findAuctionProgramAddressBase(
    "auction",
    args[0],
    args[1],
    args[2]
  );
  return auction;
};

export const getQuoteVaultPk = async (...args: GetAuctionAddressesParams) => {
  const quoteVault = await findAuctionProgramAddressBase(
    "quote_vault",
    args[0],
    args[1],
    args[2]
  );
  return quoteVault;
};

export const getBaseVaultPk = async (...args: GetAuctionAddressesParams) => {
  const baseVault = await findAuctionProgramAddressBase(
    "base_vault",
    args[0],
    args[1],
    args[2]
  );
  return baseVault;
};

export const getAuctionAddresses = async (
  ...args: GetAuctionAddressesParams
) => {
  const [auctionPk, quoteVault, baseVault] = await Promise.all([
    getauctionPk(args[0], args[1], args[2]),
    getQuoteVaultPk(args[0], args[1], args[2]),
    getBaseVaultPk(args[0], args[1], args[2]),
  ]);
  return {
    auctionPk,
    quoteVault,
    baseVault,
  };
};

export const getOpenOrdersPk = async (
  wallet: PublicKey,
  auctionId: Uint8Array,
  auctionAuthority: PublicKey,
  programId: PublicKey
) => {
  const [openOrdersPk] = await PublicKey.findProgramAddress(
    [
      wallet.toBuffer(),
      Buffer.from("open_orders"),
      Buffer.from(auctionId),
      auctionAuthority.toBuffer(),
    ],
    programId
  );
  return openOrdersPk;
};

export const getOrderHistoryPk = async (
  wallet: PublicKey,
  auctionId: Uint8Array,
  auctionAuthority: PublicKey,
  programId: PublicKey
) => {
  const [orderHistoryPk] = await PublicKey.findProgramAddress(
    [
      wallet.toBuffer(),
      Buffer.from("order_history"),
      Buffer.from(auctionId),
      auctionAuthority.toBuffer(),
    ],
    programId
  );
  return orderHistoryPk;
};

export const findAuctionProgramAddressBase = async (
  bufferName: string,
  param1: Buffer | number[] | Uint8Array,
  param2: PublicKey,
  programPk: PublicKey
) => {
  let [pk] = await PublicKey.findProgramAddress(
    // TODO toBuffer might not be LE (lower endian) by default
    [Buffer.from(bufferName), Buffer.from(param1), param2.toBuffer()],
    programPk
  );
  return pk;
};
