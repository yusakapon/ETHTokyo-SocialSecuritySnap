import { apolloClient } from './utils/apollo-client';
import {
  DefaultProfileDocument,
  DefaultProfileRequest,
} from './utils/graphql/generated';
import type { VercelRequest, VercelResponse } from '@vercel/node';

type Data = {
  data: any;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { method } = req;
  switch (method) {
    case 'GET':
      getDefaultProfile(req, res);
      break;
    default:
      res.setHeader('Allow', ['GET']);
      res.status(405).end(`Method ${method} Not Allowed`);
  }
}

const getDefaultProfileRequest = async (request: DefaultProfileRequest) => {
  const result = await apolloClient.query({
    query: DefaultProfileDocument,
    variables: {
      request,
    },
  });
  return result.data.defaultProfile;
};

const getDefaultProfile = async (req: VercelRequest, res: VercelResponse) => {
  const { walletAddress } = req.query;
  const result = await getDefaultProfileRequest({
    ethereumAddress: walletAddress,
  });
  console.log('profiles: result', result);

  const data =
    walletAddress === '0xd19B53464bBD3289823b278efb0461a903271004'
      ? { handle: 'yusaka.test' }
      : { handle: 'sakasaka.test' };
  res.status(200).json({ data: data });

  // res.status(200).json({ data: result });

  return;
};
