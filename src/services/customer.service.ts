import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Customer } from "../entities/customer.entity";

@Injectable()
export class CustomerService {
  constructor(
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>
  ) {}

  async getCustomerMasterData(lightweight: boolean = false) {
    const customers = await this.customerRepository.find({
      order: { firmName: "ASC" },
    });

    return customers.map((customer) => {
      if (lightweight) {
        // Return only id, firmName, and city for lightweight mode
        return {
          id: customer.id,
          firmName: customer.firmName,
          city: customer.city,
        };
      }

      // Return all fields including lat and long
      return {
        id: customer.id,
        firmName: customer.firmName,
        address: customer.address,
        city: customer.city,
        pincode: customer.pincode,
        phone: customer.phone,
        geoLatitude: customer.geoLatitude,
        geoLongitude: customer.geoLongitude,
        createdAt: customer.createdAt,
        lastUpdatedAt: customer.lastUpdatedAt,
      };
    });
  }
}
