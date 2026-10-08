import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Put, Query, Req, Res } from '@nestjs/common';
import { Response } from 'express';
import { DateTime, IANAZone } from 'luxon';
import { z } from 'zod';
import { OwnerRequest } from './auth';
import { monthSchema, operationSchema, parse, positiveMoney, signedMoney, uuid } from './validation';
import { WalletService } from './wallet.service';
const label = z.string().trim().min(1).max(50);
const icon = z.enum(['shopping-basket','coffee','car','house','shopping-bag','heart-pulse','popcorn','repeat','graduation-cap','shapes','briefcase-business','circle-plus','gift','plane','utensils']);
const querySchema = z.object({ month: monthSchema.optional(), kind: z.enum(['expense','income','transfer','refund','adjustment','opening']).optional(), categoryId: uuid.optional(), accountId: uuid.optional(), q: z.string().max(100).optional(), cursor: uuid.optional(), deleted: z.enum(['true','false']).optional() }).strict();
@Controller()
export class WalletController {
  constructor(private readonly wallet: WalletService) {}
  @Get('me') me(@Req() req: OwnerRequest) { return this.wallet.owner(req.ownerId); }
  @Get('accounts') accounts(@Req() req: OwnerRequest) { return this.wallet.accounts(req.ownerId); }
  @Post('accounts') createAccount(@Req() req: OwnerRequest, @Body() body: unknown) {
    return this.wallet.createAccount(req.ownerId, parse(z.object({ name: label, kind: z.enum(['card','cash','savings']).default('card'), openingBalance: signedMoney.default('0') }).strict(), body));
  }
  @Patch('accounts/:id') updateAccount(@Req() req: OwnerRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.wallet.updateAccount(req.ownerId, parse(uuid,id), parse(z.object({ name: label.optional(), archived: z.boolean().optional() }).strict(), body));
  }
  @Get('categories') categories(@Req() req: OwnerRequest) { return this.wallet.categories(req.ownerId); }
  @Post('categories') createCategory(@Req() req: OwnerRequest, @Body() body: unknown) {
    return this.wallet.createCategory(req.ownerId, parse(z.object({ name: label, kind: z.enum(['expense','income']).default('expense'), icon: icon.default('shapes') }).strict(), body));
  }
  @Patch('categories/:id') updateCategory(@Req() req: OwnerRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.wallet.updateCategory(req.ownerId, parse(uuid,id), parse(z.object({ name: label.optional(), archived: z.boolean().optional(), favorite: z.boolean().optional(), icon: icon.optional() }).strict(), body));
  }
  @Get('transactions') operations(@Req() req: OwnerRequest, @Query() query: unknown) {
    return this.wallet.operations(req.ownerId, parse(querySchema,query));
  }
  @Post('transactions') create(@Req() req: OwnerRequest, @Body() body: unknown, @Headers('idempotency-key') key: string) {
    return this.wallet.createOperation(req.ownerId, parse(operationSchema,body), parse(z.string().uuid(),key));
  }
  @Patch('transactions/:id') update(@Req() req: OwnerRequest, @Param('id') id: string, @Body() body: unknown) {
    const { version, ...input } = parse(operationSchema.extend({ version: z.number().int().positive() }),body);
    return this.wallet.updateOperation(req.ownerId, parse(uuid,id),input,version);
  }
  @Delete('transactions/:id') remove(@Req() req: OwnerRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.wallet.removeOperation(req.ownerId, parse(uuid,id),parse(z.object({ version:z.number().int().positive() }).strict(),body).version);
  }
  @Post('transactions/:id/restore') restore(@Req() req: OwnerRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.wallet.removeOperation(req.ownerId, parse(uuid,id),parse(z.object({ version:z.number().int().positive() }).strict(),body).version,true);
  }
  @Get('reports/summary') summary(@Req() req: OwnerRequest, @Query('month') month?: string) {
    return this.wallet.summary(req.ownerId,parse(monthSchema.optional(),month));
  }
  @Put('budgets/:month') budget(@Req() req: OwnerRequest, @Param('month') month: string, @Body() body: unknown) {
    return this.wallet.budget(req.ownerId,parse(monthSchema,month),parse(z.object({ amount: positiveMoney }).strict(),body).amount);
  }
  @Patch('settings') settings(@Req() req: OwnerRequest, @Body() body: unknown) {
    return this.wallet.settings(req.ownerId,parse(z.object({ name:label.optional(), timezone:z.string().max(100).refine(s=>IANAZone.isValidZone(s)).optional(),theme:z.enum(['system','light','dark']).optional() }).strict(),body));
  }
  @Get('exports/transactions.csv') async export(@Req() req: OwnerRequest, @Query('month') month: string | undefined, @Res() res: Response) {
    const data = await this.wallet.export(req.ownerId,parse(monthSchema.optional(),month));
    res.setHeader('Content-Type','text/csv; charset=utf-8');
    res.setHeader('Content-Disposition','attachment; filename="wallet.csv"');res.send(data);
  }
}
