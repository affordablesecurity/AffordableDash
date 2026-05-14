import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("ChangeMe123!", 12);

  await prisma.user.upsert({
    where: { email: "owner@locksmith.local" },
    update: { username: "owner" },
    create: {
      email: "owner@locksmith.local",
      username: "owner",
      name: "Owner",
      passwordHash,
      role: "OWNER"
    }
  });

  const organization = await prisma.organization.upsert({
    where: { slug: "demo-locksmith" },
    update: {},
    create: {
      name: "Demo Locksmith",
      slug: "demo-locksmith"
    }
  });

  const location = await prisma.location.upsert({
    where: { organizationId_slug: { organizationId: organization.id, slug: "el-centro" } },
    update: {},
    create: {
      organizationId: organization.id,
      name: "El Centro",
      slug: "el-centro",
      phone: "15555550111",
      city: "El Centro",
      state: "CA",
      timezone: "America/Los_Angeles"
    }
  });

  const owner = await prisma.user.findUniqueOrThrow({ where: { email: "owner@locksmith.local" } });

  await prisma.userMembership.upsert({
    where: { userId_organizationId_locationId: { userId: owner.id, organizationId: organization.id, locationId: location.id } },
    update: {},
    create: {
      userId: owner.id,
      organizationId: organization.id,
      locationId: location.id,
      role: "OWNER"
    }
  });

  const customer = await prisma.customer.upsert({
    where: { id: "demo-customer" },
    update: {},
    create: {
      id: "demo-customer",
      locationId: location.id,
      firstName: "Sample",
      lastName: "Customer",
      phone: "15555550100",
      email: "customer@example.com",
      source: "Seed",
      addresses: {
        create: {
          street1: "100 Main St",
          city: "Phoenix",
          state: "AZ",
          postalCode: "85001"
        }
      }
    },
    include: { addresses: true }
  });

  const tech = await prisma.technician.upsert({
    where: { id: "demo-tech" },
    update: {},
    create: {
      id: "demo-tech",
      locationId: location.id,
      name: "Lead Technician",
      phone: "15555550199",
      email: "tech@example.com",
      color: "#16a34a"
    }
  });

  await prisma.job.upsert({
    where: { id: "demo-job" },
    update: {},
    create: {
      id: "demo-job",
      locationId: location.id,
      customerId: customer.id,
      addressId: customer.addresses[0]?.id,
      technicianId: tech.id,
      title: "Residential lockout",
      jobType: "Lockout",
      status: "SCHEDULED",
      scheduledStart: new Date(Date.now() + 1000 * 60 * 60 * 2),
      scheduledEnd: new Date(Date.now() + 1000 * 60 * 60 * 3),
      description: "Customer locked out of front door."
    }
  });
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  });
