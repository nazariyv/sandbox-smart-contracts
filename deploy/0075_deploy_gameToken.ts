import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {deployments, getNamedAccounts} = hre;
  const {deploy} = deployments;
  const {deployer, gameTokenAdmin} = await getNamedAccounts();
  const sandContract = await deployments.get('Sand');
  const assetContract = await deployments.get('Asset');

  await deploy('GameToken', {
    from: deployer,
    log: true,
    args: [sandContract.address, gameTokenAdmin, assetContract.address],
  });
};

export default func;
func.tags = ['GameToken', 'GameToken_deploy'];
func.dependencies = ['Sand', 'Asset'];
