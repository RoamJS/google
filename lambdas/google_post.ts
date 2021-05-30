import { APIGatewayProxyHandler } from "aws-lambda";

export const handler: APIGatewayProxyHandler = (event) => {
  return {
    statusCode: 200,
    body: JSON.stringify({
      success: true,
    }),
    headers: {
      "Access-Control-Allow-Origin": "https://roamresearch.com",
      "Access-Control-Allow-Methods": "POST",
    },
  };
}