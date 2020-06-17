import { getAddress } from '@ethersproject/address'
import { NowRequest, NowResponse } from '@now/node'
import { BigNumber } from '@uniswap/sdk'

import { getReserves } from './_shared'
import { return200, return400, return500 } from '../utils'

function getAmountOut(
  amountIn: BigNumber,
  reserveIn: BigNumber,
  reserveOut: BigNumber
): { amountOut: BigNumber; reservesInAfter: BigNumber; reservesOutAfter: BigNumber } {
  const amountOut = reserveOut.minus(
    reserveOut.multipliedBy(reserveIn).dividedBy(reserveIn.plus(amountIn.multipliedBy(0.997)))
  )
  return {
    amountOut,
    reservesInAfter: reserveIn.plus(amountIn),
    reservesOutAfter: reserveOut.minus(amountOut)
  }
}

function computeBids(baseReserves: BigNumber, quoteReserves: BigNumber, numSegments: number): [string, string][] {
  const increment = baseReserves.dividedBy(numSegments)
  const amountsIn = Array.from({ length: numSegments }, (x, i): BigNumber => increment.multipliedBy(i + 1))
  return amountsIn.map((amountIn, ix): [string, string] => {
    const { reservesInAfter, reservesOutAfter } =
      ix === 0
        ? { reservesInAfter: baseReserves, reservesOutAfter: quoteReserves }
        : getAmountOut(amountIn.minus(increment), baseReserves, quoteReserves)
    const { amountOut } = getAmountOut(increment, reservesInAfter, reservesOutAfter)
    return [increment.toString(), amountOut.dividedBy(amountIn).toString()]
  })
}

function computeBidsAsks(
  baseReserves: BigNumber,
  quoteReserves: BigNumber,
  numSegments: number = 20
): { bids: [string, string][]; asks: [string, string][] } {
  if (baseReserves.eq(0) || quoteReserves.eq(0)) {
    return {
      bids: [],
      asks: []
    }
  }

  return {
    bids: computeBids(baseReserves, quoteReserves, numSegments),
    asks: computeBids(quoteReserves, baseReserves, numSegments).map(([amount, price]) => [
      amount,
      new BigNumber(1).dividedBy(new BigNumber(price)).toString()
    ])
  }
}

export default async function(req: NowRequest, res: NowResponse): Promise<void> {
  if (
    !req.query.pair ||
    typeof req.query.pair !== 'string' ||
    !/^0x[0-9a-fA-F]{40}_0x[0-9a-fA-F]{40}$/.test(req.query.pair)
  ) {
    return400(res, 'Invalid pair identifier: must be of format tokenAddress_tokenAddress')
    return
  }

  const [tokenA, tokenB] = req.query.pair.split('_')
  let idA: string, idB: string
  try {
    ;[idA, idB] = [getAddress(tokenA), getAddress(tokenB)]
  } catch (error) {
    return400(res)
    return
  }

  try {
    const [reservesA, reservesB] = await getReserves(idA, idB)

    const timestamp = new Date().getTime()

    return200(
      res,
      {
        timestamp,
        ...computeBidsAsks(new BigNumber(reservesA), new BigNumber(reservesB))
      },
      60 * 15
    )
  } catch (error) {
    return500(res, error)
  }
}
