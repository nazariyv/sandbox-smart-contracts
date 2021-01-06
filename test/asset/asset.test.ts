import {setupAsset} from './fixtures';
import {waitFor} from '../utils';
import {expect} from '../chai-setup';

describe('Asset.sol', function () {
  it('user sending asset to itself keep the same balance', async function () {
    const {Asset, users, mintAsset} = await setupAsset();
    const tokenId = await mintAsset(users[0].address, 20);
    await waitFor(
      users[0].Asset['safeTransferFrom(address,address,uint256,uint256,bytes)'](
        users[0].address,
        users[0].address,
        tokenId,
        10,
        '0x'
      )
    );
    const balance = await Asset['balanceOf(address,uint256)'](
      users[0].address,
      tokenId
    );
    expect(balance).to.be.equal(20);
  });

  it('user batch sending asset to itself keep the same balance', async function () {
    const {Asset, users, mintAsset} = await setupAsset();
    const tokenId = await mintAsset(users[0].address, 20);
    await waitFor(
      users[0].Asset.safeBatchTransferFrom(
        users[0].address,
        users[0].address,
        [tokenId],
        [10],
        '0x'
      )
    );
    const balance = await Asset['balanceOf(address,uint256)'](
      users[0].address,
      tokenId
    );
    expect(balance).to.be.equal(20);
  });
});
