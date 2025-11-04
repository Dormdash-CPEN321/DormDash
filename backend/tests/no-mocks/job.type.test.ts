import { describe, expect, test } from '@jest/globals';
import { jobSchema, JobType } from '../../src/types/job.type';
import mongoose from 'mongoose';

describe('job.type.ts - Zod Schema Validation', () => {
    describe('jobSchema', () => {
        test('should validate valid job data', () => {
            const validData = {
                orderId: new mongoose.Types.ObjectId().toString(),
                studentId: new mongoose.Types.ObjectId().toString(),
                jobType: JobType.STORAGE,
                volume: 10,
                price: 50,
                pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
                dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
                scheduledTime: new Date().toISOString()
            };

            const result = jobSchema.parse(validData);
            expect(result).toEqual(validData);
        });

        test('should reject invalid orderId', () => {
            const invalidData = {
                orderId: 'invalid-id',
                studentId: new mongoose.Types.ObjectId().toString(),
                jobType: JobType.STORAGE,
                volume: 10,
                price: 50,
                pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
                dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
                scheduledTime: new Date().toISOString()
            };

            expect(() => jobSchema.parse(invalidData)).toThrow('Invalid order ID');
        });

        test('should reject invalid studentId', () => {
            const invalidData = {
                orderId: new mongoose.Types.ObjectId().toString(),
                studentId: 'invalid-id',
                jobType: JobType.STORAGE,
                volume: 10,
                price: 50,
                pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
                dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
                scheduledTime: new Date().toISOString()
            };

            expect(() => jobSchema.parse(invalidData)).toThrow('Invalid student ID');
        });

        test('should validate RETURN job type', () => {
            const validData = {
                orderId: new mongoose.Types.ObjectId().toString(),
                studentId: new mongoose.Types.ObjectId().toString(),
                jobType: JobType.RETURN,
                volume: 15,
                price: 75,
                pickupAddress: { lat: 49.2606, lon: -123.2460, formattedAddress: 'Warehouse Address' },
                dropoffAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Return Address' },
                scheduledTime: new Date().toISOString()
            };

            const result = jobSchema.parse(validData);
            expect(result.jobType).toBe(JobType.RETURN);
        });

        test('should reject invalid job type', () => {
            const invalidData = {
                orderId: new mongoose.Types.ObjectId().toString(),
                studentId: new mongoose.Types.ObjectId().toString(),
                jobType: 'INVALID_TYPE',
                volume: 10,
                price: 50,
                pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
                dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
                scheduledTime: new Date().toISOString()
            };

            expect(() => jobSchema.parse(invalidData)).toThrow();
        });

        test('should reject negative volume', () => {
            const invalidData = {
                orderId: new mongoose.Types.ObjectId().toString(),
                studentId: new mongoose.Types.ObjectId().toString(),
                jobType: JobType.STORAGE,
                volume: -10,
                price: 50,
                pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
                dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
                scheduledTime: new Date().toISOString()
            };

            expect(() => jobSchema.parse(invalidData)).toThrow();
        });

        test('should reject negative price', () => {
            const invalidData = {
                orderId: new mongoose.Types.ObjectId().toString(),
                studentId: new mongoose.Types.ObjectId().toString(),
                jobType: JobType.STORAGE,
                volume: 10,
                price: -50,
                pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
                dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
                scheduledTime: new Date().toISOString()
            };

            expect(() => jobSchema.parse(invalidData)).toThrow();
        });

        test('should validate ObjectId format edge cases', () => {
            // Test with valid ObjectId strings
            const validObjectId = new mongoose.Types.ObjectId().toString();
            const validData = {
                orderId: validObjectId,
                studentId: validObjectId,
                jobType: JobType.STORAGE,
                volume: 10,
                price: 50,
                pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
                dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
                scheduledTime: new Date().toISOString()
            };

            expect(() => jobSchema.parse(validData)).not.toThrow();
        });
    });
});

