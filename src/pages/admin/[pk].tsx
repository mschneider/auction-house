import { PublicKey, Transaction } from "@solana/web3.js";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import Modal from "../../components/Modal";
import useLocalStorageState, {
  handleParseKeyPairObj,
} from "../../hooks/useLocalStorageState";
import * as nacl from "tweetnacl";
import useAuctionStore, {
  fetchAuction,
  fetchOpenOrders,
} from "../../stores/AuctionStore";
import useTokenStore, {
  fetchMintAndTokenAccount,
} from "../../stores/TokenStore";
import useWalletStore from "../../stores/WalletStore";
import useConnectionStore from "../../stores/ConnectionStore";
import { BN } from "@project-serum/anchor";
import Button from "../../components/Button";
import { createAskInstructions } from "../../../sdkv2/auction";

const AdminView = () => {
  const router = useRouter();
  const { pk } = router.query;
  const { programId } = useAuctionStore((s) => s.program);
  const selected = useAuctionStore((s) => s.selected);
  const orders = useAuctionStore((s) => s.orders);
  const connection = useConnectionStore((s) => s.connection);
  const { tokenAccounts, mints } = useTokenStore((s) => s);
  const wallet = useWalletStore((s) => s.current);
  const connected = useWalletStore((s) => s.connected);

  const [openAskModal, setOpenAskModal] = useState(false);

  const [localOrderKey] = useLocalStorageState(
    "localOrderKey",
    nacl.box.keyPair(),
    handleParseKeyPairObj
  );
  console.log(localOrderKey);
  const secretKey = localOrderKey.secretKey;

  // derive shared secret
  const decryptionKey = useMemo(() => {
    console.log("memo", "decryptionKey", selected?.auction);
    if (selected?.auction) {
      return nacl.box.before(selected.auction.naclPubkey, secretKey);
    }
  }, [selected, secretKey]);

  // TODO: move to token store
  const baseToken = useMemo(() => {
    if (tokenAccounts && selected?.auction.baseMint)
      return tokenAccounts[selected.auction.baseMint.toBase58()]?.address;
  }, [tokenAccounts, selected]);
  const quoteToken = useMemo(() => {
    if (tokenAccounts && selected?.auction.quoteMint)
      return tokenAccounts[selected.auction.quoteMint.toBase58()]?.address;
  }, [tokenAccounts, selected]);
  const baseDecimals = useMemo(() => {
    if (mints && selected?.auction.baseMint)
      return mints[selected.auction.baseMint.toBase58()]?.decimals;
  }, [mints, selected]);
  const quoteDecimals = useMemo(() => {
    if (mints && selected?.auction.quoteMint)
      return mints[selected.auction.quoteMint.toBase58()]?.decimals;
  }, [mints, selected]);
  const baseAmount = useMemo(() => {
    if (tokenAccounts && selected?.auction.baseMint)
      return tokenAccounts[selected.auction.baseMint.toBase58()]?.amount;
  }, [tokenAccounts, selected]);
  const quoteAmount = useMemo(() => {
    if (tokenAccounts && selected?.auction.quoteMint)
      return tokenAccounts[selected.auction.quoteMint.toBase58()]?.amount;
  }, [tokenAccounts, selected]);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm({
    defaultValues: {
      amount: 0,
      price: 0,
      deposit: 0,
    },
  });

  useEffect(() => {
    (async () => {
      if (pk) fetchAuction(new PublicKey(pk));
    })();
  }, [pk]);

  useEffect(() => {
    if (pk && wallet?.publicKey) {
      fetchOpenOrders(new PublicKey(pk), wallet.publicKey);
      fetchMintAndTokenAccount(selected?.auction.baseMint);
      fetchMintAndTokenAccount(selected?.auction.quoteMint);
    }
  }, [pk, wallet, connected, openAskModal]);

  const createAsk = async (data: any) => {
    (async () => {
      if (
        !wallet ||
        !pk ||
        !selected ||
        !baseToken ||
        !quoteToken ||
        !baseDecimals ||
        !quoteDecimals
      )
        return;

      const auction = selected.auction;
      const tx = new Transaction();
      const askInstructions = await createAskInstructions({
        connection,
        amount: data.amount,
        price: data.price,
        deposit: data.deposit,
        wallet: wallet.publicKey,
        programId,
        auction,
        auctionPk: new PublicKey(pk),
        quoteToken,
        baseToken,
        baseDecimals,
        quoteDecimals,
        localOrderKey,
      });
      tx.add(...askInstructions);
      // send & confirm tx
      const sig = await wallet.sendTransaction(tx, connection);
      console.log("create ask", sig);

      await connection.confirmTransaction(sig);
      console.log("create ask confirmed");

      await fetchOpenOrders(new PublicKey(pk), wallet.publicKey!);
    })();
  };

  return (
    <>
      <div className="grid grid-cols-1 gap-4">
        <div className="border p-4">
          <h1>Actions</h1>
          <div className=" p-1 inline-block">
            <Button onClick={() => setOpenAskModal(true)}>Create Ask</Button>
          </div>
        </div>
        <div className="border p-4">
          <h1>Auction</h1>
          <p>Pk: {pk}</p>
          <p>
            Tick Size:{" "}
            {selected && selected.auction.tickSize.toNumber() / 2 ** 32}
          </p>
        </div>
        <div className="border p-4">
          <h1>Orderbook</h1>
          <p>Bids: </p>
          {selected?.bids.getL2DepthJS(10, false).map((p) => (
            <p>
              {p.size / 10 ** baseDecimals!} @ {p.price / 2 ** 32}
            </p>
          ))}

          <p>Asks:</p>
          {selected?.asks.getL2DepthJS(10, true).map((p) => (
            <p>
              {p.size / 10 ** baseDecimals!} @ {p.price / 2 ** 32}
            </p>
          ))}
        </div>

        <div className="border p-4">
          <h1>Open Orders</h1>
          {orders?.oo && (
            <div>
              <p>Side: {orders.oo.side.kind}</p>
              <p>NumOrders: {orders.oo.numOrders}</p>
              <p>
                Base [free/locked]: {orders.oo.baseTokenFree.toString()} |{" "}
                {orders.oo.baseTokenLocked.toString()}
              </p>
              <p>
                Quote [free/locked]: {orders.oo.quoteTokenFree.toString()} |{" "}
                {orders.oo.quoteTokenLocked.toString()}
              </p>
              <p>Orders:</p>
              {orders.oo.orders.map((o, i) => {
                const price = o.shrn(64).toNumber() / 2 ** 32;

                return (
                  <div className="text-sm" key={i}>
                    <p>Price: {price}</p>
                  </div>
                );
              })}
              <p>Encrypted Orders:</p>
              {decryptionKey &&
                orders.oo.encryptedOrders.map((o, i) => {
                  try {
                    const plainText = nacl.box.open.after(
                      Uint8Array.from(o.cipherText),
                      Uint8Array.from(o.nonce),
                      decryptionKey
                    )!;
                    // scale encrypted price (fp32) by tick size (fp32) and convert to number
                    const price =
                      new BN(plainText.slice(0, 8), undefined, "le")
                        .mul(selected!.auction.tickSize)
                        .shrn(32)
                        .toNumber() /
                      2 ** 32;
                    // quantity in base
                    const quantity =
                      new BN(
                        plainText.slice(8, 16),
                        undefined,
                        "le"
                      ).toNumber() /
                      10 ** baseDecimals!;
                    const deposit = o.tokenQty.toNumber() / 10 ** baseDecimals!;
                    return (
                      <div className="text-sm" key={i}>
                        <p>Price: {price}</p>
                        <p>Quantity: {quantity}</p>
                        <p>Deposit: {deposit}</p>
                      </div>
                    );
                  } catch (e) {
                    console.error(e);
                    return <></>;
                  }
                })}
            </div>
          )}
        </div>
      </div>

      {openAskModal && (
        <Modal
          onClose={() => {
            setOpenAskModal(false);
          }}
          isOpen={openAskModal}
        >
          <div className="">
            <h1>Create Ask</h1>
            <form onSubmit={handleSubmit(createAsk)}>
              <p>Base Balance: {Number(baseAmount!) / 10 ** baseDecimals!}</p>

              <div>
                <label className="space-x-2">
                  <span>Amount:</span>
                  <input
                    type="number"
                    className="border"
                    {...register("amount", { valueAsNumber: true })}
                  />
                </label>
              </div>

              <div>
                <label className="space-x-2">
                  <span>Price:</span>
                  <input
                    type="number"
                    className="border"
                    step="any"
                    {...register("price", { valueAsNumber: true })}
                  />
                </label>
              </div>

              {selected?.auction.areAsksEncrypted && (
                <div>
                  <label className="space-x-2">
                    <span>Deposit:</span>
                    <input
                      type="number"
                      className="border"
                      {...(register("deposit"), { valueAsNumber: true })}
                    />
                  </label>
                </div>
              )}
              <Button className=" p-1" type="submit">
                Send
              </Button>
            </form>
          </div>
        </Modal>
      )}
    </>
  );
};

export default AdminView;
