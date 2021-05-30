terraform {
  backend "remote" {
    hostname = "app.terraform.io"
    organization = "VargasArts"
    workspaces {
      prefix = "roamjs-google"
    }
  }
  required_providers {
    github = {
      source = "integrations/github"
      version = "4.2.0"
    }
  }
}

variable "aws_access_token" {
  type = string
}

variable "aws_secret_token" {
  type = string
}

variable "developer_token" {
  type = string
}

variable "github_token" {
  type = string
}

variable "google_client_id" {
    type = string  
}

variable "google_client_secret" {
    type = string  
}

provider "aws" {
  region = "us-east-1"
  access_key = var.aws_access_token
  secret_key = var.aws_secret_token
}

provider "github" {
    owner = "dvargas92495"
    token = var.github_token
}

module "roamjs_lambda" {
  source = "dvargas92495/lambda/roamjs"
  providers = {
    aws = aws
    github = github
  }

  name = "google"
  lambdas = [
    { 
      path = "google-auth", 
      method = "post"
    },
  ]
  aws_access_token = var.aws_access_token
  aws_secret_token = var.aws_secret_token
  github_token     = var.github_token
  developer_token  = var.developer_token
}

resource "github_actions_secret" "google_client_id" {
  repository       = "roamjs-google"
  secret_name      = "GOOGLE_CLIENT_ID"
  plaintext_value  = var.google_client_id
}

resource "github_actions_secret" "google_client_secret" {
  repository       = "roamjs-google"
  secret_name      = "GOOGLE_CLIENT_SECRET"
  plaintext_value  = var.google_client_secret
}
